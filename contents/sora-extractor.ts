import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://sora.chatgpt.com/*"],
  all_frames: false
}

interface MediaItem {
  url: string
  type: 'video' | 'thumbnail'
  filename: string
}

interface ExtractedMedia {
  videos: MediaItem[]
  thumbnails: MediaItem[]
}

// Extract URLs from JSON objects
function extractUrlsFromJson(obj: any): { videos: string[], thumbnails: string[] } {
  const videos: string[] = []
  const thumbnails: string[] = []
  
  function traverse(obj: any) {
    if (typeof obj === 'string') {
      if (/\.(mp4|webm|mov|avi)$/i.test(obj)) {
        videos.push(obj)
      } else if (/\.(jpg|jpeg|png|webp)$/i.test(obj)) {
        thumbnails.push(obj)
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        traverse(obj[key])
      }
    }
  }
  
  traverse(obj)
  return { videos, thumbnails }
}

// Convert relative URLs to absolute
function toAbsoluteUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http')) {
    return url
  }
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

// Generate filename from URL
function generateFilename(url: string, type: 'video' | 'thumbnail'): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const extension = pathname.split('.').pop() || (type === 'video' ? 'mp4' : 'jpg')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `sora-${type}-${timestamp}.${extension}`
  } catch {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `sora-${type}-${timestamp}.${type === 'video' ? 'mp4' : 'jpg'}`
  }
}

// Main extraction function
function extractMediaFromPage(): ExtractedMedia {
  const videos: MediaItem[] = []
  const thumbnails: MediaItem[] = []
  const baseUrl = window.location.origin

  // Extract video elements
  const videoElements = document.querySelectorAll('video')
  videoElements.forEach(video => {
    const src = video.getAttribute('src')
    if (src) {
      const absoluteUrl = toAbsoluteUrl(src, baseUrl)
      videos.push({
        url: absoluteUrl,
        type: 'video',
        filename: generateFilename(absoluteUrl, 'video')
      })
    }

    const sources = video.querySelectorAll('source')
    sources.forEach(source => {
      const src = source.getAttribute('src')
      if (src) {
        const absoluteUrl = toAbsoluteUrl(src, baseUrl)
        videos.push({
          url: absoluteUrl,
          type: 'video',
          filename: generateFilename(absoluteUrl, 'video')
        })
      }
    })
  })

  // Extract image elements that might be thumbnails
  const imgElements = document.querySelectorAll('img')
  imgElements.forEach(img => {
    const src = img.getAttribute('src')
    if (src) {
      const srcLower = src.toLowerCase()
      // Filter for likely thumbnails
      if (['thumb', 'preview', 'video', 'cover', 'poster', 'sora'].some(keyword => 
        srcLower.includes(keyword))) {
        const absoluteUrl = toAbsoluteUrl(src, baseUrl)
        thumbnails.push({
          url: absoluteUrl,
          type: 'thumbnail',
          filename: generateFilename(absoluteUrl, 'thumbnail')
        })
      }
    }
  })

  // Extract from scripts
  const scripts = document.querySelectorAll('script')
  scripts.forEach(script => {
    if (script.textContent) {
      const scriptContent = script.textContent
      
      // JSON patterns to look for
      const jsonPatterns = [
        /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
        /window\.__STATE__\s*=\s*({.*?});/s,
        /__NEXT_DATA__"\s*content="([^"]+)"/,
        /"video"\s*:\s*{[^}]*"url"\s*:\s*"([^"]+)"/,
        /"thumbnail"\s*:\s*"([^"]+)"/,
        /"src"\s*:\s*"([^"]*\.(?:mp4|webm|mov|avi|jpg|jpeg|png)[^"]*)"/,
        /"url"\s*:\s*"([^"]*\.(?:mp4|webm|mov|avi|jpg|jpeg|png)[^"]*)"/
      ]

      jsonPatterns.forEach(pattern => {
        const matches = scriptContent.match(pattern)
        if (matches) {
          try {
            if (matches[1] && matches[1].startsWith('{')) {
              // Handle JSON objects
              const jsonObj = JSON.parse(matches[1])
              const urls = extractUrlsFromJson(jsonObj)
              urls.videos.forEach(url => {
                const absoluteUrl = toAbsoluteUrl(url, baseUrl)
                videos.push({
                  url: absoluteUrl,
                  type: 'video',
                  filename: generateFilename(absoluteUrl, 'video')
                })
              })
              urls.thumbnails.forEach(url => {
                const absoluteUrl = toAbsoluteUrl(url, baseUrl)
                thumbnails.push({
                  url: absoluteUrl,
                  type: 'thumbnail',
                  filename: generateFilename(absoluteUrl, 'thumbnail')
                })
              })
            } else if (matches[1]) {
              // Handle direct URL matches
              const url = matches[1]
              if (/\.(mp4|webm|mov|avi)$/i.test(url)) {
                const absoluteUrl = toAbsoluteUrl(url, baseUrl)
                videos.push({
                  url: absoluteUrl,
                  type: 'video',
                  filename: generateFilename(absoluteUrl, 'video')
                })
              } else if (/\.(jpg|jpeg|png|webp)$/i.test(url)) {
                const absoluteUrl = toAbsoluteUrl(url, baseUrl)
                thumbnails.push({
                  url: absoluteUrl,
                  type: 'thumbnail',
                  filename: generateFilename(absoluteUrl, 'thumbnail')
                })
              }
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
        }
      })
    }
  })

  // Search for direct URLs in page content
  const pageText = document.body.textContent || ''
  const urlPattern = /https?:\/\/[^\s<>"'{}|\\^`\[\]]*\.(?:mp4|webm|mov|avi|jpg|jpeg|png|webp)/gi
  const directUrls = pageText.match(urlPattern) || []

  directUrls.forEach(url => {
    if (/\.(mp4|webm|mov|avi)$/i.test(url)) {
      videos.push({
        url: url,
        type: 'video',
        filename: generateFilename(url, 'video')
      })
    } else if (/\.(jpg|jpeg|png|webp)$/i.test(url)) {
      thumbnails.push({
        url: url,
        type: 'thumbnail',
        filename: generateFilename(url, 'thumbnail')
      })
    }
  })

  // Remove duplicates while preserving order
  const uniqueVideos = videos.filter((video, index, self) => 
    index === self.findIndex(v => v.url === video.url)
  )
  const uniqueThumbnails = thumbnails.filter((thumb, index, self) => 
    index === self.findIndex(t => t.url === thumb.url)
  )

  return {
    videos: uniqueVideos,
    thumbnails: uniqueThumbnails
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractMedia') {
    try {
      const extractedMedia = extractMediaFromPage()
      sendResponse({ success: true, data: extractedMedia })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }
  return true // Keep message channel open for async response
})

// Auto-extract when page loads
window.addEventListener('load', () => {
  setTimeout(() => {
    const extractedMedia = extractMediaFromPage()
    // Store in sessionStorage for popup to access
    sessionStorage.setItem('sora-extracted-media', JSON.stringify(extractedMedia))
  }, 2000) // Wait 2 seconds for dynamic content to load
})
