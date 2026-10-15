import { describe, it, expect } from "vitest";
import { isSafeOutboundUrl } from "@/lib/utils/ssrf-guard";

describe("SSRF Protection Guard (isSafeOutboundUrl)", () => {
  it("blocks AWS / GCP / Azure cloud metadata IP (169.254.169.254)", () => {
    expect(isSafeOutboundUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeOutboundUrl("http://169.254.169.254/")).toBe(false);
    expect(isSafeOutboundUrl("https://169.254.1.1/")).toBe(false);
  });

  it("blocks localhost and loopback interfaces", () => {
    expect(isSafeOutboundUrl("http://127.0.0.1:6379/")).toBe(false);
    expect(isSafeOutboundUrl("http://127.0.0.2:8080/")).toBe(false);
    expect(isSafeOutboundUrl("http://localhost:5432/")).toBe(false);
    expect(isSafeOutboundUrl("http://localhost.localdomain/")).toBe(false);
    expect(isSafeOutboundUrl("http://0.0.0.0:8000/")).toBe(false);
  });

  it("blocks RFC 1918 private subnets (10.x, 172.16-31.x, 192.168.x)", () => {
    expect(isSafeOutboundUrl("http://10.0.0.1/admin")).toBe(false);
    expect(isSafeOutboundUrl("http://172.16.0.1/internal")).toBe(false);
    expect(isSafeOutboundUrl("http://172.31.255.255/")).toBe(false);
    expect(isSafeOutboundUrl("http://192.168.1.1/router")).toBe(false);
  });

  it("blocks non-HTTP protocols (file, gopher, dict, ftp)", () => {
    expect(isSafeOutboundUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeOutboundUrl("gopher://127.0.0.1:6379/_INFO")).toBe(false);
    expect(isSafeOutboundUrl("dict://127.0.0.1:11211/")).toBe(false);
    expect(isSafeOutboundUrl("ftp://192.168.1.1/")).toBe(false);
  });

  it("blocks decimal, hex, and octal numeric IP bypasses", () => {
    // 2130706433 is 127.0.0.1 in decimal notation
    expect(isSafeOutboundUrl("http://2130706433/")).toBe(false);
    // 0x7f000001 is 127.0.0.1 in hex notation
    expect(isSafeOutboundUrl("http://0x7f000001/")).toBe(false);
  });

  it("blocks IPv6 loopback and internal prefixes", () => {
    expect(isSafeOutboundUrl("http://[::1]/")).toBe(false);
    expect(isSafeOutboundUrl("http://[fe80::1]/")).toBe(false);
    expect(isSafeOutboundUrl("http://[fc00::1]/")).toBe(false);
    expect(isSafeOutboundUrl("http://[::ffff:127.0.0.1]/")).toBe(false);
    expect(isSafeOutboundUrl("http://[::ffff:169.254.169.254]/")).toBe(false);
  });

  it("allows legitimate public external URLs and APIs", () => {
    expect(isSafeOutboundUrl("https://api.openai.com/v1")).toBe(true);
    expect(isSafeOutboundUrl("https://api.groq.com/openai/v1")).toBe(true);
    expect(isSafeOutboundUrl("https://openrouter.ai/api/v1")).toBe(true);
    expect(isSafeOutboundUrl("https://news.google.com/rss")).toBe(true);
    expect(isSafeOutboundUrl("https://api.anthropic.com/v1")).toBe(true);
  });

  it("fails safely on invalid or malformed URLs", () => {
    expect(isSafeOutboundUrl("")).toBe(false);
    expect(isSafeOutboundUrl("not-a-url")).toBe(false);
    expect(isSafeOutboundUrl("http://")).toBe(false);
  });
});
