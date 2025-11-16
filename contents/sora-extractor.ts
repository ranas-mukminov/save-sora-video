import type { PlasmoCSConfig } from "plasmo"
import { isValidMediaUrl, hasOpenAISignature } from "~utils/url-validator"
import { setStorageData, getStorageData } from "~utils/chrome-api"
import {
  VIDEO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  ALL_MEDIA_EXTENSIONS,
  CACHE_TTL_MS,
  STORAGE_KEY_PREFIX,
  MAX_JSON_LENGTH,
  MAX_BODY_TEXT_LENGTH,
  DIRECT_URL_PATTERN,
  PAGE_LOAD_DELAY_MS,
  type VideoExtension,
  type ImageExtension,
} from "~utils/constants"

export const config: PlasmoCSConfig = {
  matches: ["https://sora.chatgpt.com/*"],
  all_frames: false,
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

interface CacheEntry {
  timestamp: number
  data: ExtractedMedia
}

declare global {
  interface Window {
    __soraMediaCache?: CacheEntry
  }
}

const getStorageKey = (): string => `${STORAGE_KEY_PREFIX}${window.location.href}`

const isCacheFresh = (timestamp: number): boolean => Date.now() - timestamp < CACHE_TTL_MS

const getFreshCache = (): ExtractedMedia | null => {
  const cached = window.__soraMediaCache
  if (cached && isCacheFresh(cached.timestamp)) {
    return cached.data
  }
  return null
}

const persistCache = async (data: ExtractedMedia): Promise<void> => {
  const entry: CacheEntry = { timestamp: Date.now(), data }
  window.__soraMediaCache = entry

  try {
    await setStorageData(getStorageKey(), entry)
  } catch (error) {
    console.debug("Unable to persist media cache:", error)
  }
}

const hydrateCacheFromStorage = async (): Promise<void> => {
  try {
    const entry = await getStorageData<CacheEntry>(getStorageKey())
    if (entry?.timestamp && entry.data && isCacheFresh(entry.timestamp)) {
      window.__soraMediaCache = entry
    }
  } catch (error) {
    console.debug("Unable to hydrate media cache:", error)
  }
}

// Initialize cache hydration
void hydrateCacheFromStorage()

const videoExtensionPattern = new RegExp(`\\.(${VIDEO_EXTENSIONS.join("|")})(?:$|[?&])`, "i")
const imageExtensionPattern = new RegExp(`\\.(${IMAGE_EXTENSIONS.join("|")})(?:$|[?&])`, "i")

const isVideoUrl = (url: string): boolean => videoExtensionPattern.test(url)
const isImageUrl = (url: string): boolean => imageExtensionPattern.test(url)

const normaliseBasePath = (url: string): string => url.split(/[?#]/)[0]

/**
 * Extract media URLs from JSON object recursively
 * Uses WeakSet to prevent infinite loops from circular references
 */
const extractUrlsFromJson = (obj: unknown): { videos: string[]; thumbnails: string[] } => {
  const videos = new Set<string>()
  const thumbnails = new Set<string>()
  const visited = new WeakSet<object>()

  const traverse = (value: unknown): void => {
    if (typeof value === "string") {
      if (isVideoUrl(value) && isValidMediaUrl(value, VIDEO_EXTENSIONS)) {
        videos.add(value)
      } else if (isImageUrl(value) && isValidMediaUrl(value, IMAGE_EXTENSIONS)) {
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
    thumbnails: Array.from(thumbnails),
  }
}

/**
 * Convert relative URL to absolute URL with validation
 */
const toAbsoluteUrl = (url: string, baseUrl: string): string | null => {
  if (typeof url !== "string" || !url.trim()) {
    return null
  }

  const trimmed = url.trim()

  // Block dangerous protocols
  if (/^(?:data|blob|javascript):/i.test(trimmed) || trimmed.startsWith("#")) {
    return null
  }

  const candidate = trimmed.startsWith("http")
    ? trimmed
    : (() => {
        try {
          return new URL(trimmed, baseUrl).href
        } catch {
          return null
        }
      })()

  return candidate
}

/**
 * Sanitize file extension to prevent injection
 */
const sanitiseExtension = (extension: string, type: MediaType): string => {
  const cleanExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (type === "video" && VIDEO_EXTENSIONS.includes(cleanExtension as VideoExtension)) {
    return cleanExtension
  }
  if (type === "thumbnail" && IMAGE_EXTENSIONS.includes(cleanExtension as ImageExtension)) {
    return cleanExtension
  }
  return type === "video" ? "mp4" : "jpg"
}

/**
 * Generate safe filename with timestamp
 */
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

/**
 * Deduplicate media items, prioritizing signed URLs
 */
const deduplicateMedia = (items: MediaItem[]): MediaItem[] => {
  const unique = new Map<string, MediaItem>()

  items.forEach((item) => {
    const basePath = normaliseBasePath(item.url)
    const existing = unique.get(basePath)

    if (!existing) {
      unique.set(basePath, item)
      return
    }

    // Prefer URLs with OpenAI signature
    if (hasOpenAISignature(item.url) && !hasOpenAISignature(existing.url)) {
      unique.set(basePath, item)
    }
  })

  return Array.from(unique.values())
}

/**
 * Register media item with validation
 */
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

  // Determine allowed extensions based on media type
  const allowedExtensions = type === "video" ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS

  // Validate URL with comprehensive security checks
  if (!isValidMediaUrl(absoluteUrl, allowedExtensions)) {
    return
  }

  collection.push({
    url: absoluteUrl,
    type,
    filename: generateFilename(absoluteUrl, type),
  })
}

/**
 * Extract media from page DOM and scripts
 * Uses multiple extraction methods for comprehensive coverage
 */
const extractMediaFromPage = (): ExtractedMedia => {
  const videos: MediaItem[] = []
  const thumbnails: MediaItem[] = []
  const baseUrl = window.location.origin

  // Method 1: Extract from <video> elements
  document.querySelectorAll("video").forEach((videoElement) => {
    registerMedia(videos, videoElement.getAttribute("src"), "video", baseUrl)
    videoElement.querySelectorAll("source").forEach((sourceElement) => {
      registerMedia(videos, sourceElement.getAttribute("src"), "video", baseUrl)
    })
  })

  // Method 2: Extract from <img> elements (with thumbnail heuristics)
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

  // Method 3: Extract from <script> tags with JSON data
  const scriptPatterns = [
    /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
    /window\.__STATE__\s*=\s*({.*?});/s,
    /__NEXT_DATA__"\s*content="([^"]+)"/,
    /"video"\s*:\s*{[^}]*"url"\s*:\s*"([^"]+)"/,
    /"thumbnail"\s*:\s*"([^"]+)"/,
    new RegExp(`"src"\\s*:\\s*"([^\"]*\\.(${ALL_MEDIA_EXTENSIONS.join("|")})[^\"]*)"`, "i"),
    new RegExp(`"url"\\s*:\\s*"([^\"]*\\.(${ALL_MEDIA_EXTENSIONS.join("|")})[^\"]*)"`, "i"),
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
      } catch (err) {
        // Ignore malformed JSON and continue scanning other patterns
        console.debug("Failed to parse JSON from script:", err)
      }
    })
  })

  // Method 4: Extract from page body text (limited for performance)
  const bodyText = document.body?.textContent ?? ""
  if (bodyText) {
    const limitedText = bodyText.length > MAX_BODY_TEXT_LENGTH ? bodyText.slice(0, MAX_BODY_TEXT_LENGTH) : bodyText
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
    thumbnails: deduplicateMedia(thumbnails),
  }

  // Persist to cache asynchronously
  void persistCache(result)

  return result
}

// Message listener for popup communication
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
    console.error("Media extraction failed:", error)
    sendResponse({ success: false, error: message })
  }

  return false
})

// Auto-extract media after page load
window.addEventListener("load", () => {
  window.setTimeout(() => {
    try {
      extractMediaFromPage()
    } catch (error) {
      console.warn("Failed to cache extracted media:", error)
    }
  }, PAGE_LOAD_DELAY_MS)
})
