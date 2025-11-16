/**
 * URL Validation Utilities
 * Provides secure URL validation to prevent XSS and SSRF attacks
 */

const VALID_PROTOCOLS = new Set(['https:']);
const ALLOWED_DOMAINS = ['openai.com', 'videos.openai.com'];

/**
 * Check if hostname is a private/internal IP address
 * Prevents SSRF attacks against internal networks
 */
const isPrivateIP = (hostname: string): boolean => {
  const patterns = [
    /^127\./,                          // Loopback (127.0.0.0/8)
    /^10\./,                           // Private Class A (10.0.0.0/8)
    /^172\.(1[6-9]|2[0-9]|3[01])\./,  // Private Class B (172.16.0.0/12)
    /^192\.168\./,                     // Private Class C (192.168.0.0/16)
    /^169\.254\./,                     // Link-local (169.254.0.0/16)
    /^::1$/,                           // IPv6 loopback
    /^fe80:/i,                         // IPv6 link-local
    /^fc00:/i,                         // IPv6 private (fc00::/7)
    /^fd00:/i,                         // IPv6 unique local
    /^localhost$/i,
    /^0\.0\.0\.0$/,                    // Wildcard
    /^\[::1\]$/,                       // IPv6 loopback bracketed
  ];

  return patterns.some((pattern) => pattern.test(hostname));
};

/**
 * Check if URL points to allowed domain
 */
const isAllowedDomain = (hostname: string): boolean => {
  return ALLOWED_DOMAINS.some((domain) =>
    hostname === domain || hostname.endsWith(`.${domain}`)
  );
};

/**
 * Validate if URL is safe for image display (prevents XSS)
 */
export const isSafeImageUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (!VALID_PROTOCOLS.has(parsed.protocol)) {
      return false;
    }

    // Block private IPs
    if (isPrivateIP(parsed.hostname)) {
      return false;
    }

    // Only allow OpenAI domains
    if (!isAllowedDomain(parsed.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Check if URL has OpenAI signature parameters (higher priority)
 */
export const hasOpenAISignature = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    return (
      params.has('sig') &&
      params.has('st') &&
      params.has('se') &&
      params.has('sv')
    );
  } catch {
    return false;
  }
};

/**
 * Validate URL for media extraction (comprehensive check)
 */
export const isValidMediaUrl = (
  url: string,
  allowedExtensions: readonly string[]
): boolean => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);

    // Only allow HTTPS
    if (!VALID_PROTOCOLS.has(urlObj.protocol)) {
      return false;
    }

    // Block private IPs
    if (isPrivateIP(urlObj.hostname)) {
      return false;
    }

    // Check file extension
    const pathname = urlObj.pathname.toLowerCase();
    const hasValidExtension = allowedExtensions.some(
      (ext) => pathname.endsWith(`.${ext}`) || pathname.includes(`.${ext}?`)
    );

    if (!hasValidExtension) {
      return false;
    }

    // Block invalid path segments
    const invalidSegments = ['undefined', 'null', '{{', '}}', 'placeholder', 'example.com'];
    if (invalidSegments.some((segment) => pathname.includes(segment))) {
      return false;
    }

    // For OpenAI domains, require signature
    if (isAllowedDomain(urlObj.hostname)) {
      return hasOpenAISignature(url);
    }

    // For other domains, be more restrictive
    // (Currently we only allow OpenAI, so this would return false)
    return false;
  } catch {
    return false;
  }
};

/**
 * Sanitize URL for display purposes (truncate, remove sensitive params)
 */
export const sanitizeUrlForDisplay = (url: string, maxLength: number = 100): string => {
  try {
    const parsed = new URL(url);
    // Remove signature parameters for cleaner display
    parsed.searchParams.delete('sig');
    parsed.searchParams.delete('st');
    parsed.searchParams.delete('se');
    parsed.searchParams.delete('sv');

    const sanitized = parsed.toString();
    return sanitized.length > maxLength
      ? sanitized.substring(0, maxLength) + '...'
      : sanitized;
  } catch {
    return url.substring(0, maxLength);
  }
};
