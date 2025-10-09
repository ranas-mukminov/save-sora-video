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

// Validate URL format and prioritize signed URLs
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    // Check if it's a valid HTTP/HTTPS URL
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false
    }
    
    // Additional checks for common invalid patterns
    const pathname = urlObj.pathname.toLowerCase()
    
    // Skip URLs that are likely to be invalid
    if (pathname.includes('undefined') || 
        pathname.includes('null') || 
        pathname.includes('{{') || 
        pathname.includes('}}') ||
        pathname.includes('placeholder') ||
        pathname.includes('example.com') ||
        pathname.includes('localhost') ||
        pathname.includes('127.0.0.1')) {
      return false
    }
    
    // Check for valid file extensions
    const validVideoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
    const validImageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
    const hasValidExt = [...validVideoExts, ...validImageExts].some(ext => 
      pathname.endsWith(ext) || pathname.includes(ext + '?')
    )
    
    if (!hasValidExt) {
      return false
    }
    
    // For OpenAI/Sora videos, prioritize URLs with SAS signatures
    if (urlObj.hostname.includes('openai.com') || urlObj.hostname.includes('videos.openai.com')) {
      const searchParams = urlObj.searchParams
      // Check for Azure SAS signature parameters
      const hasSignature = searchParams.has('sig') && 
                          searchParams.has('st') && 
                          searchParams.has('se') &&
                          searchParams.has('sv')
      
      if (hasSignature) {
        // This is a signed URL with access permissions - prioritize it
        return true
      } else {
        // This is likely an unsigned URL without access permissions - skip it
        return false
      }
    }
    
    return true
  } catch {
    return false
  }
}

// Check if URL has higher priority (signed URLs, etc.)
function hasHigherPriority(url: string): boolean {
  try {
    const urlObj = new URL(url)
    
    // For OpenAI/Sora videos, signed URLs have higher priority
    if (urlObj.hostname.includes('openai.com') || urlObj.hostname.includes('videos.openai.com')) {
      const searchParams = urlObj.searchParams
      return searchParams.has('sig') && searchParams.has('st') && searchParams.has('se')
    }
    
    return false
  } catch {
    return false
  }
}

// Convert relative URLs to absolute and validate
function toAbsoluteUrl(url: string, baseUrl: string): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }
  
  // Clean up the URL
  url = url.trim()
  
  // Skip data URLs, blob URLs, and other non-http protocols
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || url.startsWith('#')) {
    return null
  }
  
  if (url.startsWith('http')) {
    return isValidUrl(url) ? url : null
  }
  
  try {
    const absoluteUrl = new URL(url, baseUrl).href
    return isValidUrl(absoluteUrl) ? absoluteUrl : null
  } catch {
    return null
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
      if (absoluteUrl) {
        videos.push({
          url: absoluteUrl,
          type: 'video',
          filename: generateFilename(absoluteUrl, 'video')
        })
      }
    }

    const sources = video.querySelectorAll('source')
    sources.forEach(source => {
      const src = source.getAttribute('src')
      if (src) {
        const absoluteUrl = toAbsoluteUrl(src, baseUrl)
        if (absoluteUrl) {
          videos.push({
            url: absoluteUrl,
            type: 'video',
            filename: generateFilename(absoluteUrl, 'video')
          })
        }
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
        if (absoluteUrl) {
          thumbnails.push({
            url: absoluteUrl,
            type: 'thumbnail',
            filename: generateFilename(absoluteUrl, 'thumbnail')
          })
        }
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
                if (absoluteUrl) {
                  videos.push({
                    url: absoluteUrl,
                    type: 'video',
                    filename: generateFilename(absoluteUrl, 'video')
                  })
                }
              })
              urls.thumbnails.forEach(url => {
                const absoluteUrl = toAbsoluteUrl(url, baseUrl)
                if (absoluteUrl) {
                  thumbnails.push({
                    url: absoluteUrl,
                    type: 'thumbnail',
                    filename: generateFilename(absoluteUrl, 'thumbnail')
                  })
                }
              })
            } else if (matches[1]) {
              // Handle direct URL matches
              const url = matches[1]
              if (/\.(mp4|webm|mov|avi)$/i.test(url)) {
                const absoluteUrl = toAbsoluteUrl(url, baseUrl)
                if (absoluteUrl) {
                  videos.push({
                    url: absoluteUrl,
                    type: 'video',
                    filename: generateFilename(absoluteUrl, 'video')
                  })
                }
              } else if (/\.(jpg|jpeg|png|webp)$/i.test(url)) {
                const absoluteUrl = toAbsoluteUrl(url, baseUrl)
                if (absoluteUrl) {
                  thumbnails.push({
                    url: absoluteUrl,
                    type: 'thumbnail',
                    filename: generateFilename(absoluteUrl, 'thumbnail')
                  })
                }
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
    if (isValidUrl(url)) {
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
    }
  })

  // Remove duplicates while prioritizing signed URLs
  const uniqueVideos = videos.reduce((acc: MediaItem[], current) => {
    // Find existing item with same base path (without query params)
    const currentBasePath = current.url.split('?')[0]
    const existingIndex = acc.findIndex(item => item.url.split('?')[0] === currentBasePath)
    
    if (existingIndex === -1) {
      // No existing item, add current
      acc.push(current)
    } else {
      // Compare priority - keep the one with higher priority (signed URL)
      const existing = acc[existingIndex]
      if (hasHigherPriority(current.url) && !hasHigherPriority(existing.url)) {
        acc[existingIndex] = current
      }
    }
    
    return acc
  }, [])
  
  const uniqueThumbnails = thumbnails.reduce((acc: MediaItem[], current) => {
    // Find existing item with same base path (without query params)
    const currentBasePath = current.url.split('?')[0]
    const existingIndex = acc.findIndex(item => item.url.split('?')[0] === currentBasePath)
    
    if (existingIndex === -1) {
      // No existing item, add current
      acc.push(current)
    } else {
      // Compare priority - keep the one with higher priority (signed URL)
      const existing = acc[existingIndex]
      if (hasHigherPriority(current.url) && !hasHigherPriority(existing.url)) {
        acc[existingIndex] = current
      }
    }
    
    return acc
  }, [])

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
