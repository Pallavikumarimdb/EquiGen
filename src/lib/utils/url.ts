const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function sanitizeHref(url: string): string {
  return isSafeUrl(url) ? url : "#";
}
