#!/usr/bin/env node
/**
 * Scans git-tracked files for committed secrets.
 *
 * WHY THIS EXISTS
 * This repository shipped two hardcoded credentials that were only found by manual
 * review: a JWT signing fallback (`default-secret-key-at-least-32-chars-long`) and an
 * AES-256-GCM master key (`a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`). Both were reachable in
 * production whenever the corresponding environment variable was unset. Neither is
 * caught by linting or by the type checker, and neither would fail a build.
 *
 * SCOPE AND LIMITS — stated plainly so this is not over-trusted:
 *  - It scans the WORKING TREE of tracked files, not full history. A secret that was
 *    committed and later removed is still in history and must be rotated regardless of
 *    this check passing. Use `git log -p -S'<value>'` to search history.
 *  *  - It is a backstop, not a replacement for review. It matches patterns and known
 *    literals; a novel secret format will not match.
 *  - Comment lines are not exempt. A secret pasted into a comment is still committed
 *    and still readable, so only genuinely non-secret lines (placeholders, env reads,
 *    test constants) are allowlisted.
 *
 * Exits 1 when a finding is reported so CI fails.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

/** Files never worth scanning. */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "coverage",
  "playwright-report",
  "test-results",
  ".report-debug",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".yml", ".yaml", ".env", ".md", ".sql", ".prisma",
  ".example", ".sh", ".txt", ".toml",
]);

/**
 * Literal secrets that were previously committed and must never reappear.
 * Keep these in sync with removals; the value is the point.
 */
const KNOWN_COMMITTED_SECRETS = [
  {
    value: "default-secret-key-at-least-32-chars-long",
    what: "JWT signing fallback (removed)",
  },
  {
    value: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    what: "AES-256-GCM master key for tenant provider keys",
  },
];

/** High-signal credential shapes. Each pattern is anchored to reduce false positives. */
const SECRET_PATTERNS = [
  {
    name: "private key block",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/,
  },
  { name: "AWS access key id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slack token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    name: "live provider key",
    // gsk_ is the only provider prefix still used here; the others are prefixes seen in
    // UI copy or docs and would false-positive.
    regex: /\bgsk_[A-Za-z0-9]{32,}\b/,
  },
  {
    name: "credential in URL",
    regex: /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:@\s/]+:[^@\s]+@/,
    // Only flag a connection string that is NOT plainly a local-dev placeholder.
    // `postgresql://postgres:postgres@localhost:5432/...` is the conventional local
    // DSN and carries no secret; flagging it would train everyone to ignore output.
    // The host sits after the credentials, so match it anywhere in the URL.
    skipIf: (line) =>
      /\/\/[^/\s]*localhost(?::|\/)/i.test(line) ||
      /\/\/[^/\s]*127\.0\.0\.1(?::|\/)/i.test(line) ||
      /\/\/[^/\s]*\[::1\](?::|\/)/i.test(line),
  },
  {
    name: "hardcoded secret assignment",
    regex:
      /\b(?:secret|password|passwd|api[_-]?key|apikey|token|private[_-]?key)\b\s*[:=]\s*["'][^"'\s${}<>]{12,}["']/i,
  },
];

/** Lines matching these are legitimately non-secret (placeholders, docs, examples). */
const ALLOWLIST = [
  /your[_-]?\w*[_-]?key[_-]?here/i,
  /gsk_YOUR_KEY_HERE/,
  /whsec_[\w]*example/i,
  /\bTODO\b/,
  /\bfixture\b/i,
  /\bmock(ed)?\b/i,
  /\.example\b/,
  /process\.env\./,
  /process\.env\[/,
  /os\.randomUUID|crypto\.randomUUID/,
  /openssl rand/,
  /placeholder/i,
  /example\.com|example\.test/,
  /"typecheck"|"audit:secrets"/,
  // Security regression tests deliberately use a fixed, non-secret value so the
  // "rejects a wrong secret" assertion is deterministic.
  /unit-test|test-internal-secret|test-secret/,
];

function isAllowlisted(line) {
  return ALLOWLIST.some((re) => re.test(line));
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function shouldScan(relPath) {
  const parts = relPath.split(/[\\/]/);
  if (parts.some((p) => SKIP_DIRS.has(p))) return false;
  const ext = extname(relPath);
  if (ext === ".lock" || relPath.endsWith("pnpm-lock.yaml")) return false;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Extensionless files that are conventionally config (e.g. ".env", "Dockerfile").
  const base = parts[parts.length - 1];
  return /^(Dockerfile|\.env.*|\.npmrc|\.gitignore)$/i.test(base);
}

const findings = [];
let scanned = 0;

for (const relPath of trackedFiles()) {
  if (!shouldScan(relPath)) continue;

  let stat;
  try {
    stat = statSync(relPath);
  } catch {
    continue;
  }
  // Skip binaries masquerading as text.
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;

  let content;
  try {
    content = readFileSync(relPath, "utf8");
  } catch {
    continue;
  }
  scanned += 1;

  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isAllowlisted(line)) return;

    for (const { value, what } of KNOWN_COMMITTED_SECRETS) {
      if (line.includes(value)) {
        findings.push({
          relPath,
          lineNo: i + 1,
          rule: "previously-committed secret",
          detail: `${what} — literal still present`,
        });
      }
    }

    for (const { name, regex, skipIf } of SECRET_PATTERNS) {
      if (skipIf?.(line)) continue;
      if (regex.test(line)) {
        findings.push({
          relPath,
          lineNo: i + 1,
          rule: name,
          // Quote a redacted slice: enough to locate, not enough to reuse.
          detail: line.trim().slice(0, 60).replace(/[A-Za-z0-9]{12,}/g, "***"),
        });
      }
    }
  });
}

console.log(`scanned ${scanned} tracked file(s)`);

if (findings.length === 0) {
  console.log("no committed secrets detected");
  process.exit(0);
}

console.error(`\n${findings.length} potential secret(s) in committed files:\n`);
for (const f of findings) {
  console.error(`  ${f.relPath}:${f.lineNo}  [${f.rule}] ${f.detail}`);
}
console.error(
  "\nIf a finding is a genuine secret, rotate it — removing it from the file does not\n" +
    "remove it from git history. Add a false positive to ALLOWLIST with a reason.",
);
process.exit(1);