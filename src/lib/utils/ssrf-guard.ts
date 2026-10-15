import net from "net";

/**
 * SSRF Protection Utility — blocks internal networks, cloud metadata, and bypass encodings.
 * Designed per OWASP and Bug Bounty methodology standards (SKILL.md).
 */

const PRIVATE_OR_RESERVED_IPV4_PATTERNS = [
  /^0\./, // Current network (0.0.0.0/8)
  /^10\./, // Private 10.0.0.0/8
  /^127\./, // Loopback 127.0.0.0/8
  /^169\.254\./, // Link-local / Cloud metadata 169.254.0.0/16
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private 172.16.0.0/12
  /^192\.168\./, // Private 192.168.0.0/16
  /^192\.0\.0\./, // IETF Protocol Assignments
  /^198\.18\./, // Benchmark testing
  /^198\.19\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT
  /^224\./, // Multicast
  /^240\./, // Reserved
];

/**
 * Validates whether an untrusted URL is safe for outbound HTTP requests by the server.
 * Returns false if the URL targets localhost, private RFC1918 networks, or cloud metadata endpoints.
 */
export function isSafeOutboundUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  // Only plain HTTP and HTTPS protocols are permitted (blocks file:, gopher:, dict:, etc.)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Block localhost aliases
  if (
    hostname === "localhost" ||
    hostname === "localhost.localdomain" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    return false;
  }

  // Handle standard or enclosed alphanumeric and decimal bypasses (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^(?:[0-9]+|0x[0-9a-fA-F]+)$/.test(hostname)) {
    return false;
  }

  const cleanIp = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  // IPv6 and IPv4-mapped IPv6 checks (e.g. [::1], [::ffff:127.0.0.1], [fe80:...])
  if (
    cleanIp === "::1" ||
    cleanIp === "::" ||
    cleanIp.startsWith("fe80:") ||
    cleanIp.startsWith("fc00:") ||
    cleanIp.startsWith("fd00:") ||
    cleanIp.startsWith("::ffff:") ||
    cleanIp.includes("127.0.0.1") ||
    cleanIp.includes("169.254.")
  ) {
    return false;
  }

  // Check if hostname is an IP address
  const ipType = net.isIP(cleanIp);
  if (ipType === 4) {
    for (const pattern of PRIVATE_OR_RESERVED_IPV4_PATTERNS) {
      if (pattern.test(cleanIp)) {
        return false;
      }
    }
  } else if (ipType === 6) {
    return false; // Block all other direct IPv6 addresses for strict safety
  }

  return true;
}
