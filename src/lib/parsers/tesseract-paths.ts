import path from 'path';
import { existsSync } from 'fs';

let cachedWorkerPath: string | null = null;

/**
 * tesseract.js v7 resolves its default workerPath from __dirname of the bundled entry.
 * Next.js bundles the library into .next/server, so that default lands on a
 * non-existent .next/worker-script/node/index.js. Resolve the real file from
 * node_modules instead (dev + production both keep node_modules on disk).
 */
export function resolveTesseractWorkerPath(): string {
  if (cachedWorkerPath) return cachedWorkerPath;

  const candidate = path.join(
    process.cwd(),
    'node_modules',
    'tesseract.js',
    'src',
    'worker-script',
    'node',
    'index.js'
  );

  if (!existsSync(candidate)) {
    throw new Error(
      `Tesseract worker script not found at ${candidate} — run "pnpm install" to restore node_modules.`
    );
  }

  cachedWorkerPath = candidate;
  return cachedWorkerPath;
}
