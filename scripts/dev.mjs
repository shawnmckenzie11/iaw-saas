#!/usr/bin/env node
/**
 * Starts backend + frontend after freeing default dev ports (3000, 3002).
 */
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTS = [3000, 3002];

/**
 * Terminates any process listening on the given TCP port (macOS/Linux lsof).
 */
function freePort(port) {
  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
    if (!out) return;
    for (const pid of out.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        // process may have already exited
      }
    }
    console.log(`[dev] Freed port ${port} (was in use)`);
  } catch {
    // nothing listening
  }
}

for (const port of PORTS) {
  freePort(port);
}

console.log('[dev] Starting backend (:3002) + frontend (:3000)...');
console.log('[dev] Open the app at http://localhost:3000  (NOT :3002 — that is API-only)\n');

const child = spawn(
  'npx concurrently "npm run dev:backend" "npm run dev:frontend"',
  {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  }
);

child.on('exit', (code) => process.exit(code ?? 0));
