/**
 * Edge-runtime boundary guard.
 *
 * REGRESSION: adding `import { prisma } from "@/lib/db"` to `src/lib/utils/tenant.ts`
 * broke the dev server outright, because `src/middleware.ts` imports that module and
 * middleware runs on the Edge runtime, which cannot execute `pg`:
 *
 *   Error: The edge runtime does not support Node.js 'crypto' module.
 *   Module not found: Can't resolve 'pg-native'
 *
 * Neither lint nor `tsc` catches it — both are runtime-bundle concerns — and the
 * failure only appears when the server boots. This test walks the middleware import
 * graph statically so the mistake fails CI instead of the app.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const SRC = resolve(ROOT, "src");

/** Modules the Edge runtime cannot execute. */
const NODE_ONLY_PACKAGES = [
  "pg",
  "pg-native",
  "@prisma/client",
  "fs",
  "fs/promises",
  "path",
  "child_process",
  "crypto",
  "http",
  "https",
  "net",
  "tls",
  "zlib",
  "worker_threads",
  "os",
  "stream",
  "buffer",
];

const ENTRY = resolve(SRC, "middleware.ts");

const pathSep = process.platform === "win32" ? "\\" : "/";

/** Resolves a relative or `@/`-aliased import to an absolute path, or null. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = resolve(SRC, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return null; // bare package specifier
  }
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith(pathSep)) {
      try {
        if (readFileSync(candidate, "utf8").length >= 0) return candidate;
      } catch {
        /* not a file */
      }
    }
  }
  return null;
}

/** Statically extracts import specifiers from a TS/TSX source file. */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const importRe = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) specs.push(m[1]);

  const requireRe = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = requireRe.exec(source)) !== null) specs.push(m[1]);

  const dynRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dynRe.exec(source)) !== null) specs.push(m[1]);

  return specs;
}

/** Walks the local-import graph from `entry`, returning every reachable source file. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const spec of importSpecifiers(source)) {
      // A bare specifier naming a Node-only package is a violation wherever it appears.
      const bare = spec.replace(/^node:/, "");
      if (NODE_ONLY_PACKAGES.includes(bare)) {
        throw new Error(
          `Edge-incompatible import "${spec}" reachable from middleware via ` +
            relative(ROOT, file),
        );
      }
      const resolved = resolveImport(file, spec);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return seen;
}

describe("middleware runs on the Edge runtime", () => {
  it("has an import graph free of Node-only modules", () => {
    // Throws with the offending file if Prisma, `pg`, node:fs etc. is reachable.
    const reachable = reachableFrom(ENTRY);
    expect(reachable.size).toBeGreaterThan(1);
  });

  it("does not reach the Prisma client", () => {
    const reachable = reachableFrom(ENTRY);
    const offenders = [...reachable].filter((f) => {
      const src = readFileSync(f, "utf8");
      return /from\s+["']@\/lib\/db["']/.test(src) || /@prisma\/client/.test(src);
    });
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("does not import tenant.ts, which pulls in Prisma", () => {
    // Read the parsed import list, not the raw text: the file carries an explanatory
    // comment naming the forbidden module, and a text match would flag that comment.
    const specs = importSpecifiers(readFileSync(ENTRY, "utf8"));
    expect(specs).not.toContain("@/lib/utils/tenant");
    expect(specs).not.toContain("@/lib/db");
  });

  it("imports hasValidApiSecret from the Edge-safe module", () => {
    const specs = importSpecifiers(readFileSync(ENTRY, "utf8"));
    expect(specs).toContain("@/lib/utils/api-secret");
  });
});

describe("Content-Security-Policy dev/production split", () => {
  /**
   * REGRESSION: a single blanket `script-src 'self' 'unsafe-inline'` blocked eval in
   * development, producing "Uncaught EvalError: call to eval() blocked by CSP" and
   * breaking hydration on every page. Next.js dev requires 'unsafe-eval' for source
   * maps and React Fast Refresh. It must never reach a production build.
   */
  async function cspFor(nodeEnv: string): Promise<string> {
    vi.stubEnv("NODE_ENV", nodeEnv);
    // next.config.ts reads NODE_ENV at module scope, so re-import per environment.
    vi.resetModules();
    const mod = await import("../../../next.config");
    const rules = await mod.default.headers!();
    const app = rules.find((r: { source: string }) => r.source === "/:path*");
    vi.unstubAllEnvs();
    vi.resetModules();
    const csp = app!.headers.find(
      (h: { key: string }) => h.key === "Content-Security-Policy",
    );
    return csp!.value as string;
  }

  it("allows unsafe-eval in development so the dev server works", async () => {
    const csp = await cspFor("development");
    expect(csp).toContain("'unsafe-eval'");
  });

  it("forbids unsafe-eval in production", async () => {
    const csp = await cspFor("production");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("keeps frame protection and nosniff in both environments", async () => {
    for (const env of ["development", "production"]) {
      const csp = await cspFor(env);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
    }
  });

  it("keeps report artifacts script-free in both environments", async () => {
    for (const env of ["development", "production"]) {
      vi.stubEnv("NODE_ENV", env);
      vi.resetModules();
      const mod = await import("../../../next.config");
      const rules = await mod.default.headers!();
      const artifact = rules.find((r: { source: string }) =>
        r.source.includes("temp/reports"),
      );
      const csp = artifact!.headers.find(
        (h: { key: string }) => h.key === "Content-Security-Policy",
      )!.value as string;
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("sandbox");
      expect(csp).not.toContain("unsafe-eval");
    }
  });
});

describe("session revocation stays on the Node runtime", () => {
  it("tenant.ts keeps its Prisma import (revocation needs the database)", () => {
    // This is the reason the two modules must stay split: if someone "simplifies" by
    // moving revocation into the Edge-safe module, the database dependency returns.
    const specs = importSpecifiers(readFileSync(resolve(SRC, "lib/utils/tenant.ts"), "utf8"));
    expect(specs).toContain("@/lib/db");
  });

  it("the Edge-safe module has no database or Node-builtin dependency", () => {
    const specs = importSpecifiers(readFileSync(resolve(SRC, "lib/utils/api-secret.ts"), "utf8"));
    for (const spec of specs) {
      expect(spec).not.toBe("@/lib/db");
      expect(spec).not.toBe("crypto");
      expect(spec).not.toBe("node:crypto");
      expect(spec).not.toMatch(/^node:/);
      expect(spec).not.toMatch(/^fs(\/|$)/);
    }
  });
});