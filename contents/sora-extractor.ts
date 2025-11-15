import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://sora.chatgpt.com/*"],
  all_frames: false
}

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

declare global {
  interface Window {
    __soraMediaCache?: { timestamp: number; data: ExtractedMedia }
  }
}

const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "avi", "mkv"] as const
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const
const ALL_EXTENSIONS = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]
const VALID_PROTOCOLS = new Set(["http:", "https:"])
const INVALID_PATH_SEGMENTS = [
  "undefined",
  "null",
  "{{",
  "}}",
  "placeholder",
  "example.com",
  "localhost",
  "127.0.0.1"
]
const MAX_JSON_LENGTH = 1_000_000
const CACHE_TTL = 15_000
const STORAGE_KEY_PREFIX = "sora-media::"
const DIRECT_URL_PATTERN = new RegExp(
  `https?:\\/\\/[^\\s<>"'{}|\\\\^\`\\[\\]]*\\.(${ALL_EXTENSIONS.join("|")})`,
  "gi"
)

const getStorageKey = (): string => `${STORAGE_KEY_PREFIX}${window.location.href}`

const isCacheFresh = (timestamp: number): boolean => Date.now() - timestamp < CACHE_TTL

const getFreshCache = (): ExtractedMedia | null => {
  const cached = window.__soraMediaCache
  if (cached && isCacheFresh(cached.timestamp)) {
    return cached.data
  }
  return null
}

const persistCache = (data: ExtractedMedia): void => {
  const entry = { timestamp: Date.now(), data }
  window.__soraMediaCache = entry

  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [getStorageKey()]: entry }, () => {
        const runtimeError = chrome.runtime.lastError
        if (runtimeError) {
          console.debug("Failed to persist media cache:", runtimeError.message)
        }
      })
    }
  } catch (error) {
    console.debug("Unable to persist media cache:", error)
  }
}

const hydrateCacheFromStorage = (): void => {
  try {
    if (!chrome?.storage?.local) {
      return
    }

    chrome.storage.local.get(getStorageKey(), (result) => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        console.debug("Failed to hydrate media cache:", runtimeError.message)
        return
      }

      const entry = result?.[getStorageKey()] as { timestamp?: number; data?: ExtractedMedia } | undefined
      if (entry?.timestamp && entry.data && isCacheFresh(entry.timestamp)) {
        window.__soraMediaCache = { timestamp: entry.timestamp, data: entry.data }
      }
    })
  } catch (error) {
    console.debug("Unable to hydrate media cache:", error)
  }
}

hydrateCacheFromStorage()

const videoExtensionPattern = new RegExp(`\.(${VIDEO_EXTENSIONS.join("|")})(?:$|[?&])`, "i")
const imageExtensionPattern = new RegExp(`\.(${IMAGE_EXTENSIONS.join("|")})(?:$|[?&])`, "i")

const hasMediaExtension = (pathname: string): boolean =>
  ALL_EXTENSIONS.some((ext) => pathname.endsWith(`.${ext}`) || pathname.includes(`.${ext}?`))

const isVideoUrl = (url: string): boolean => videoExtensionPattern.test(url)
const isImageUrl = (url: string): boolean => imageExtensionPattern.test(url)

const normaliseBasePath = (url: string): string => url.split(/[?#]/)[0]

const extractUrlsFromJson = (obj: unknown): { videos: string[]; thumbnails: string[] } => {
  const videos = new Set<string>()
  const thumbnails = new Set<string>()
  const visited = new WeakSet<object>()

  const traverse = (value: unknown): void => {
    if (typeof value === "string") {
      if (isVideoUrl(value)) {
        videos.add(value)
      } else if (isImageUrl(value)) {
        thumbnails.add(value)
      }
      return
    }

    if (!value || typeof value !== "object") {
      return
    }

    if (visited.has(value as object)) {
      return
    }

    visited.add(value as object)

    if (Array.isArray(value)) {
      value.forEach(traverse)
      return
    }

    Object.values(value as Record<string, unknown>).forEach(traverse)
  }

  traverse(obj)

  return {
    videos: Array.from(videos),
    thumbnails: Array.from(thumbnails)
  }
}

const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url)
    if (!VALID_PROTOCOLS.has(urlObj.protocol)) {
      return false
    }

    const pathname = urlObj.pathname.toLowerCase()
    if (!hasMediaExtension(pathname)) {
      return false
    }

    if (INVALID_PATH_SEGMENTS.some((segment) => pathname.includes(segment))) {
      return false
    }

    if (urlObj.hostname.includes("openai.com") || urlObj.hostname.includes("videos.openai.com")) {
      const { searchParams } = urlObj
      const hasSignature =
        searchParams.has("sig") && searchParams.has("st") && searchParams.has("se") && searchParams.has("sv")

      return hasSignature
    }

    return true
  } catch {
    return false
  }
}

const hasHigherPriority = (url: string): boolean => {
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname.includes("openai.com") || urlObj.hostname.includes("videos.openai.com")) {
      const params = urlObj.searchParams
      return params.has("sig") && params.has("st") && params.has("se")
    }

    return false
  } catch {
    return false
  }
}

const toAbsoluteUrl = (url: string, baseUrl: string): string | null => {
  if (typeof url !== "string" || !url.trim()) {
    return null
  }

  const trimmed = url.trim()
  if (/^(?:data|blob|javascript):/i.test(trimmed) || trimmed.startsWith("#")) {
    return null
  }

  const candidate = trimmed.startsWith("http") ? trimmed : (() => {
    try {
      return new URL(trimmed, baseUrl).href
    } catch {
      return null
    }
  })()

  if (!candidate) {
    return null
  }

  return isValidUrl(candidate) ? candidate : null
}

const sanitiseExtension = (extension: string, type: MediaType): string => {
  const cleanExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (type === "video" && VIDEO_EXTENSIONS.includes(cleanExtension as typeof VIDEO_EXTENSIONS[number])) {
    return cleanExtension
  }
  if (type === "thumbnail" && IMAGE_EXTENSIONS.includes(cleanExtension as typeof IMAGE_EXTENSIONS[number])) {
    return cleanExtension
  }
  return type === "video" ? "mp4" : "jpg"
}

const generateFilename = (url: string, type: MediaType): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")

  try {
    const { pathname } = new URL(url)
    const extension = pathname.split(".").pop() ?? ""
    const safeExtension = sanitiseExtension(extension, type)
    return `sora-${type}-${timestamp}.${safeExtension}`
  } catch {
    return `sora-${type}-${timestamp}.${type === "video" ? "mp4" : "jpg"}`
  }
}

const deduplicateMedia = (items: MediaItem[]): MediaItem[] => {
  const unique = new Map<string, MediaItem>()

  items.forEach((item) => {
    const basePath = normaliseBasePath(item.url)
    const existing = unique.get(basePath)

    if (!existing) {
      unique.set(basePath, item)
      return
    }

    if (hasHigherPriority(item.url) && !hasHigherPriority(existing.url)) {
      unique.set(basePath, item)
    }
  })

  return Array.from(unique.values())
}

const registerMedia = (
  collection: MediaItem[],
  url: string | null | undefined,
  type: MediaType,
  baseUrl: string
): void => {
  if (!url) {
    return
  }

  const absoluteUrl = toAbsoluteUrl(url, baseUrl)
  if (!absoluteUrl) {
    return
  }

  collection.push({
    url: absoluteUrl,
    type,
    filename: generateFilename(absoluteUrl, type)
  })
}

const extractMediaFromPage = (): ExtractedMedia => {
  const videos: MediaItem[] = []
  const thumbnails: MediaItem[] = []
  const baseUrl = window.location.origin

  document.querySelectorAll("video").forEach((videoElement) => {
    registerMedia(videos, videoElement.getAttribute("src"), "video", baseUrl)
    videoElement.querySelectorAll("source").forEach((sourceElement) => {
      registerMedia(videos, sourceElement.getAttribute("src"), "video", baseUrl)
    })
  })

  document.querySelectorAll("img").forEach((imgElement) => {
    const src = imgElement.getAttribute("src")
    if (!src) {
      return
    }
    const srcLower = src.toLowerCase()
    const looksLikeThumbnail = ["thumb", "preview", "video", "cover", "poster", "sora"].some((keyword) =>
      srcLower.includes(keyword)
    )

    if (!looksLikeThumbnail) {
      return
    }

    registerMedia(thumbnails, src, "thumbnail", baseUrl)
  })

  const scriptPatterns = [
    /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
    /window\.__STATE__\s*=\s*({.*?});/s,
    /__NEXT_DATA__"\s*content="([^"]+)"/,
    /"video"\s*:\s*{[^}]*"url"\s*:\s*"([^"]+)"/,
    /"thumbnail"\s*:\s*"([^"]+)"/,
    new RegExp(`"src"\\s*:\\s*"([^\"]*\\.(${ALL_EXTENSIONS.join("|")})[^\"]*)"`, "i"),
    new RegExp(`"url"\\s*:\\s*"([^\"]*\\.(${ALL_EXTENSIONS.join("|")})[^\"]*)"`, "i")
  ]

  document.querySelectorAll("script").forEach((scriptElement) => {
    const scriptContent = scriptElement.textContent
    if (!scriptContent) {
      return
    }

    scriptPatterns.forEach((pattern) => {
      const matches = scriptContent.match(pattern)
      if (!matches || !matches[1]) {
        return
      }

      const matchContent = matches[1]
      try {
        if (matchContent.startsWith("{") && matchContent.length <= MAX_JSON_LENGTH) {
          const parsed = JSON.parse(matchContent)
          const urls = extractUrlsFromJson(parsed)
          urls.videos.forEach((videoUrl) => registerMedia(videos, videoUrl, "video", baseUrl))
          urls.thumbnails.forEach((thumbnailUrl) => registerMedia(thumbnails, thumbnailUrl, "thumbnail", baseUrl))
        } else if (isVideoUrl(matchContent)) {
          registerMedia(videos, matchContent, "video", baseUrl)
        } else if (isImageUrl(matchContent)) {
          registerMedia(thumbnails, matchContent, "thumbnail", baseUrl)
        }
      } catch {
        // Ignore malformed JSON and continue scanning other patterns
      }
    })
  })

  const bodyText = document.body?.textContent ?? ""
  if (bodyText) {
    const limitedText = bodyText.length > 500_000 ? bodyText.slice(0, 500_000) : bodyText
    const directUrls = limitedText.match(DIRECT_URL_PATTERN) ?? []
    directUrls.forEach((rawUrl) => {
      if (isVideoUrl(rawUrl)) {
        registerMedia(videos, rawUrl, "video", baseUrl)
      } else if (isImageUrl(rawUrl)) {
        registerMedia(thumbnails, rawUrl, "thumbnail", baseUrl)
      }
    })
  }

  const result = {
    videos: deduplicateMedia(videos),
    thumbnails: deduplicateMedia(thumbnails)
  }

  persistCache(result)

  return result
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || request.action !== "extractMedia") {
    return false
  }

  const cached = getFreshCache()
  if (cached) {
    sendResponse({ success: true, data: cached })
    return false
  }

  try {
    const extractedMedia = extractMediaFromPage()
    sendResponse({ success: true, data: extractedMedia })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extraction error"
    sendResponse({ success: false, error: message })
  }

  return false
})

window.addEventListener("load", () => {
  window.setTimeout(() => {
    try {
      extractMediaFromPage()
    } catch (error) {
      console.warn("Failed to cache extracted media:", error)
    }
  }, 2000)
})

