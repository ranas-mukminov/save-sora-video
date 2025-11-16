import { useState, useEffect, useMemo, useCallback, useRef, useReducer } from "react"
import { isSafeImageUrl } from "~utils/url-validator"
import {
  sendMessageToTab,
  downloadFile,
  queryTabs,
  createTab,
  writeToClipboard,
  getStorageData,
} from "~utils/chrome-api"
import {
  CACHE_TTL_MS,
  STORAGE_KEY_PREFIX,
  FEEDBACK_DISPLAY_DURATION_MS,
  ERROR_DISPLAY_DURATION_MS,
  DOWNLOAD_DELAY_MS,
  SORA_DOMAIN,
} from "~utils/constants"

type MediaType = "video" | "thumbnail"

interface MediaItem {
  url: string
  type: MediaType
  filename: string
}

interface ExtractedMedia {
  videos: MediaItem[]
  thumbnails: MediaItem[]
}

interface CacheEntry {
  timestamp: number
  data: ExtractedMedia
}

// Download state reducer for race-condition-free updates
type DownloadAction =
  | { type: "ADD"; url: string }
  | { type: "REMOVE"; url: string }
  | { type: "CLEAR" }

const downloadReducer = (state: Set<string>, action: DownloadAction): Set<string> => {
  switch (action.type) {
    case "ADD":
      return new Set([...state, action.url])
    case "REMOVE": {
      const next = new Set(state)
      next.delete(action.url)
      return next
    }
    case "CLEAR":
      return new Set()
    default:
      return state
  }
}

const buildStorageKey = (url: string): string => `${STORAGE_KEY_PREFIX}${url}`

const fontStack = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

interface MediaSectionProps {
  title: string
  icon: string
  items: MediaItem[]
  accentColor: string
  collapsed: boolean
  onToggle: () => void
  downloading: Set<string>
  onCopy: (item: MediaItem) => void
  onDownload: (item: MediaItem) => void
  onOpen: (item: MediaItem) => void
  showPreview?: boolean
}

const MediaSection = ({
  title,
  icon,
  items,
  accentColor,
  collapsed,
  onToggle,
  downloading,
  onCopy,
  onDownload,
  onOpen,
  showPreview,
}: MediaSectionProps) => {
  return (
    <div style={{ marginBottom: "18px", borderRadius: "12px", border: "1px solid #e3e8ee", overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          fontFamily: fontStack,
          color: "#1f2937",
          fontWeight: 600,
          fontSize: "15px",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>{icon}</span>
          {title}
          <span
            style={{
              fontSize: "12px",
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: "999px",
              background: `${accentColor}15`,
              color: accentColor,
            }}
          >
            {items.length}
          </span>
        </span>
        <span style={{ fontSize: "18px", color: "#9ca3af" }}>{collapsed ? "▾" : "▴"}</span>
      </button>

      {!collapsed && (
        <div style={{ padding: "0 18px 18px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((item) => {
            const isImageSafe = showPreview ? isSafeImageUrl(item.url) : true

            return (
              <div
                key={item.url}
                style={{
                  display: "grid",
                  gridTemplateColumns: showPreview && isImageSafe ? "72px 1fr" : "1fr",
                  gap: "12px",
                  alignItems: "center",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                }}
              >
                {showPreview && (
                  <div
                    style={{
                      width: "72px",
                      height: "48px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      background: "#11182710",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "24px",
                    }}
                  >
                    {isImageSafe ? (
                      <img
                        src={item.url}
                        alt={item.filename}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => {
                          // Fallback to icon on load error
                          const target = e.target as HTMLElement
                          target.style.display = "none"
                          if (target.parentElement) {
                            target.parentElement.textContent = "🖼️"
                          }
                        }}
                      />
                    ) : (
                      <span title="Preview unavailable for security reasons">🔒</span>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#1f2937" }}>{item.filename}</span>
                    <span
                      title={item.url}
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.url}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => onCopy(item)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: "1px solid #d1d5db",
                        background: "white",
                        color: "#1f2937",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Copy URL
                    </button>
                    <button
                      onClick={() => onOpen(item)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: "1px solid #d1d5db",
                        background: "white",
                        color: accentColor,
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => onDownload(item)}
                      disabled={downloading.has(item.url)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: downloading.has(item.url) ? "#d1d5db" : accentColor,
                        color: "white",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: downloading.has(item.url) ? "not-allowed" : "pointer",
                        boxShadow: downloading.has(item.url) ? "none" : `0 4px 12px ${accentColor}40`,
                      }}
                    >
                      {downloading.has(item.url) ? "Queued" : "Download"}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function IndexPopup() {
  const [extractedMedia, setExtractedMedia] = useState<ExtractedMedia>({ videos: [], thumbnails: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [downloading, dispatchDownload] = useReducer(downloadReducer, new Set<string>())
  const [isSoraPage, setIsSoraPage] = useState<boolean>(false)
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  const [storageKey, setStorageKey] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<{ video: boolean; thumbnail: boolean }>({
    video: false,
    thumbnail: false,
  })

  const isMountedRef = useRef(true)
  const latestErrorRef = useRef<string | null>(null)
  const feedbackTimeout = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (feedbackTimeout.current) {
        window.clearTimeout(feedbackTimeout.current)
      }
    }
  }, [])

  useEffect(() => {
    latestErrorRef.current = error
  }, [error])

  const showFeedback = useCallback((message: string) => {
    if (!isMountedRef.current) {
      return
    }
    setFeedback(message)
    if (feedbackTimeout.current) {
      window.clearTimeout(feedbackTimeout.current)
    }
    feedbackTimeout.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setFeedback(null)
      }
    }, FEEDBACK_DISPLAY_DURATION_MS)
  }, [])

  const showError = useCallback((message: string) => {
    if (!isMountedRef.current) {
      return
    }
    setError(message)
    window.setTimeout(() => {
      if (isMountedRef.current && latestErrorRef.current === message) {
        setError(null)
      }
    }, ERROR_DISPLAY_DURATION_MS)
  }, [])

  const wait = useCallback((ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)), [])

  const readCacheForUrl = useCallback(async (pageUrl: string): Promise<ExtractedMedia | null> => {
    const key = buildStorageKey(pageUrl)
    const entry = await getStorageData<CacheEntry>(key)

    if (entry?.timestamp && entry.data) {
      const isFresh = Date.now() - entry.timestamp < CACHE_TTL_MS
      return isFresh ? entry.data : null
    }

    return null
  }, [])

  const openInNewTab = useCallback(
    async (item: MediaItem) => {
      try {
        await createTab({ url: item.url })
        showFeedback("Opened media in new tab")
      } catch (err) {
        console.error("Failed to open media:", err)
        showError("Failed to open media in new tab")
      }
    },
    [showFeedback, showError]
  )

  const extractMedia = useCallback(async () => {
    if (!isSoraPage || activeTabId == null) {
      if (isMountedRef.current) {
        showError("Please navigate to a Sora video page first")
      }
      return
    }

    if (isMountedRef.current) {
      setLoading(true)
      setError(null)
    }

    try {
      const response = await sendMessageToTab<{ success: boolean; data?: ExtractedMedia; error?: string }>(
        activeTabId,
        { action: "extractMedia" }
      )
      if (response?.success && response.data) {
        if (isMountedRef.current) {
          setExtractedMedia(response.data)
          showFeedback("Media refreshed from page")
        }
      } else {
        throw new Error(response?.error || "Failed to extract media")
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to extract media from page"
      if (isMountedRef.current) {
        showError(message)
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [activeTabId, isSoraPage, showError, showFeedback])

  const handleDownloadFile = useCallback(
    async (item: MediaItem) => {
      dispatchDownload({ type: "ADD", url: item.url })

      try {
        await downloadFile({ url: item.url, filename: item.filename })
        showFeedback(`Queued download for ${item.filename}`)
      } catch (err) {
        console.error("Download failed:", err)
        showError(`Failed to download ${item.filename}`)
      } finally {
        if (isMountedRef.current) {
          dispatchDownload({ type: "REMOVE", url: item.url })
        }
      }
    },
    [showFeedback, showError]
  )

  const copyItem = useCallback(
    async (item: MediaItem) => {
      const success = await writeToClipboard(item.url)
      if (success) {
        showFeedback("Media URL copied")
      } else {
        showError("Unable to copy to clipboard. Please grant clipboard permissions.")
      }
    },
    [showFeedback, showError]
  )

  const downloadItem = useCallback(
    (item: MediaItem) => {
      void handleDownloadFile(item)
    },
    [handleDownloadFile]
  )

  const openItem = useCallback(
    (item: MediaItem) => {
      void openInNewTab(item)
    },
    [openInNewTab]
  )

  const downloadAll = useCallback(async () => {
    const allItems = [...extractedMedia.videos, ...extractedMedia.thumbnails]
    const seenUrls = new Set<string>()

    for (const item of allItems) {
      if (seenUrls.has(item.url)) {
        continue
      }
      seenUrls.add(item.url)
      await handleDownloadFile(item)
      await wait(DOWNLOAD_DELAY_MS)
    }

    if (allItems.length) {
      showFeedback("Queued downloads for all media")
    }
  }, [handleDownloadFile, extractedMedia.thumbnails, extractedMedia.videos, showFeedback, wait])

  const copyAllUrls = useCallback(async () => {
    const allItems = [...extractedMedia.videos, ...extractedMedia.thumbnails]
    if (!allItems.length) {
      return
    }

    const success = await writeToClipboard(allItems.map((item) => item.url).join("\n"))

    if (success) {
      showFeedback("All media URLs copied")
    } else {
      showError("Failed to copy URLs to clipboard")
    }
  }, [extractedMedia.thumbnails, extractedMedia.videos, showFeedback, showError])

  useEffect(() => {
    const init = async () => {
      try {
        const tabs = await queryTabs({ active: true, currentWindow: true })
        const tab = tabs[0]
        const url = tab?.url || ""
        const isSora = url.startsWith(SORA_DOMAIN)

        if (isMountedRef.current) {
          setIsSoraPage(isSora)
          setActiveTabId(tab?.id ?? null)
          setStorageKey(isSora && url ? buildStorageKey(url) : null)
        }

        if (isSora && tab?.id && url) {
          const cached = await readCacheForUrl(url)
          if (cached && isMountedRef.current) {
            setExtractedMedia(cached)
          } else {
            try {
              const response = await sendMessageToTab<{ success: boolean; data?: ExtractedMedia }>(tab.id, {
                action: "extractMedia",
              })
              if (response?.success && response.data && isMountedRef.current) {
                setExtractedMedia(response.data)
              }
            } catch (err) {
              console.debug("Initial extraction skipped:", err)
            }
          }
        }
      } catch (e) {
        console.debug("Failed to initialise popup:", e)
      }
    }

    void init()
  }, [readCacheForUrl])

  useEffect(() => {
    if (!storageKey || !chrome?.storage?.onChanged) {
      return
    }

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: chrome.storage.AreaName) => {
      if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, storageKey)) {
        return
      }

      const change = changes[storageKey]
      if (change?.newValue?.data && isMountedRef.current) {
        setExtractedMedia(change.newValue.data as ExtractedMedia)
      }
    }

    chrome.storage.onChanged.addListener(listener)
    return () => {
      chrome.storage.onChanged.removeListener(listener)
    }
  }, [storageKey])

  if (!isSoraPage) {
    return (
      <div
        style={{
          width: 420,
          padding: 24,
          fontFamily: fontStack,
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          color: "white",
          minHeight: 220,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>🎬 Sora Video Downloader</h2>
        <p style={{ margin: 0, opacity: 0.9 }}>Navigate to a Sora video page to start downloading videos and thumbnails.</p>
        <a
          href={SORA_DOMAIN}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 18px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.4)",
            background: "rgba(255,255,255,0.18)",
            color: "white",
            fontWeight: 600,
            textDecoration: "none",
            backdropFilter: "blur(4px)",
            transition: "all 0.2s ease",
          }}
        >
          Go to Sora
        </a>
      </div>
    )
  }

  const totalVideos = extractedMedia.videos.length
  const totalThumbnails = extractedMedia.thumbnails.length
  const totalUnique = useMemo(() => {
    return new Set([...extractedMedia.videos, ...extractedMedia.thumbnails].map((item) => item.url)).size
  }, [extractedMedia.thumbnails, extractedMedia.videos])

  const hasResults = totalVideos > 0 || totalThumbnails > 0

  return (
    <div
      style={{
        width: 520,
        minHeight: 360,
        maxHeight: 820,
        fontFamily: fontStack,
        background: "#f5f6fb",
        border: "1px solid #e5e7eb",
        borderRadius: "18px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "18px 22px", background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", color: "white" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
          🎬 Sora Video Downloader
        </h2>
        <p style={{ margin: "6px 0 0 0", fontSize: "13px", opacity: 0.88 }}>
          Extract and download high-quality Sora media in one place.
        </p>
      </div>

      <div style={{ padding: "20px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
          }}
        >
          <div style={{ background: "white", padding: "14px", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Videos</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#1f2937" }}>{totalVideos}</div>
          </div>
          <div style={{ background: "white", padding: "14px", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Thumbnails</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#1f2937" }}>{totalThumbnails}</div>
          </div>
          <div style={{ background: "white", padding: "14px", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Unique media</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#1f2937" }}>{totalUnique}</div>
          </div>
        </div>

        {(error || feedback) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {error && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "#fee2e2",
                  color: "#b91c1c",
                  borderRadius: "10px",
                  border: "1px solid #fecaca",
                  fontSize: "13px",
                }}
              >
                {error}
              </div>
            )}
            {feedback && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "#dcfce7",
                  color: "#166534",
                  borderRadius: "10px",
                  border: "1px solid #bbf7d0",
                  fontSize: "13px",
                }}
              >
                {feedback}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button
            onClick={extractMedia}
            disabled={loading}
            style={{
              padding: "12px 18px",
              borderRadius: "999px",
              border: "none",
              background: loading ? "#c7d2fe" : "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              color: "white",
              fontWeight: 600,
              fontSize: "14px",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 10px 25px rgba(99,102,241,0.35)",
            }}
          >
            {loading ? "Refreshing…" : "Extract media"}
          </button>

          <button
            onClick={downloadAll}
            disabled={downloading.size > 0 || !hasResults}
            style={{
              padding: "12px 18px",
              borderRadius: "999px",
              border: "1px solid #c4b5fd",
              background: hasResults && downloading.size === 0 ? "white" : "#ede9fe",
              color: "#4c1d95",
              fontWeight: 600,
              fontSize: "14px",
              cursor: hasResults && downloading.size === 0 ? "pointer" : "not-allowed",
            }}
          >
            {downloading.size > 0 ? "Downloading…" : "Download all"}
          </button>

          <button
            onClick={copyAllUrls}
            disabled={!hasResults}
            style={{
              padding: "12px 18px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              background: hasResults ? "white" : "#f9fafb",
              color: hasResults ? "#1f2937" : "#9ca3af",
              fontWeight: 600,
              fontSize: "14px",
              cursor: hasResults ? "pointer" : "not-allowed",
            }}
          >
            Copy all URLs
          </button>
        </div>

        {hasResults ? (
          <>
            <MediaSection
              title="Videos"
              icon="🎥"
              items={extractedMedia.videos}
              accentColor="#4f46e5"
              collapsed={collapsedSections.video}
              onToggle={() => setCollapsedSections((prev) => ({ ...prev, video: !prev.video }))}
              downloading={downloading}
              onCopy={copyItem}
              onDownload={downloadItem}
              onOpen={openItem}
            />

            <MediaSection
              title="Thumbnails"
              icon="🖼️"
              items={extractedMedia.thumbnails}
              accentColor="#059669"
              collapsed={collapsedSections.thumbnail}
              onToggle={() => setCollapsedSections((prev) => ({ ...prev, thumbnail: !prev.thumbnail }))}
              downloading={downloading}
              onCopy={copyItem}
              onDownload={downloadItem}
              onOpen={openItem}
              showPreview
            />
          </>
        ) : !loading ? (
          <div
            style={{
              textAlign: "center",
              color: "#6b7280",
              fontSize: "14px",
              padding: "40px 0",
            }}
          >
            No media detected yet. Click "Extract media" to rescan the page.
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default IndexPopup
