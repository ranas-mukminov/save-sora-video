/**
 * Application Constants
 * Centralized configuration values with documentation
 */

// Media file extensions
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'] as const;
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;
export const ALL_MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS] as const;

// Cache configuration
export const CACHE_TTL_MS = 15_000; // 15 seconds - balance between freshness and performance
export const STORAGE_KEY_PREFIX = 'sora-media::';

// Extraction limits
export const MAX_JSON_LENGTH = 1_000_000; // 1MB - prevent memory issues with huge JSON
export const MAX_BODY_TEXT_LENGTH = 500_000; // 500KB - prevent excessive regex processing

// UI timing
export const FEEDBACK_DISPLAY_DURATION_MS = 2500; // 2.5 seconds
export const ERROR_DISPLAY_DURATION_MS = 3000; // 3 seconds
export const DOWNLOAD_DELAY_MS = 300; // Delay between bulk downloads

// Content script timing
export const PAGE_LOAD_DELAY_MS = 2000; // Wait for dynamic content after page load

// Regular expressions
export const DIRECT_URL_PATTERN = new RegExp(
  `https:\\/\\/[^\\s<>"'{}|\\\\^\`\\[\\]]*\\.(${ALL_MEDIA_EXTENSIONS.join('|')})`,
  'gi'
);

// Allowed domains
export const SORA_DOMAIN = 'https://sora.chatgpt.com';
export const OPENAI_DOMAINS = ['openai.com', 'videos.openai.com'] as const;

export type VideoExtension = typeof VIDEO_EXTENSIONS[number];
export type ImageExtension = typeof IMAGE_EXTENSIONS[number];
export type MediaExtension = typeof ALL_MEDIA_EXTENSIONS[number];
