#!/usr/bin/env node
/**
 * Runs backend Jest tests then Playwright E2E tests.
 * Uses a dedicated script so stray CLI args (e.g. from copy-pasted comments)
 * are not forwarded to Playwright as invalid grep patterns.
 */
import { execSync } from 'node:child_process';

try {
  execSync('npm run test:backend', { stdio: 'inherit' });
  execSync('npm run test:e2e', { stdio: 'inherit' });
} catch (error) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : 1;
  process.exit(Number.isFinite(status) && status !== 0 ? status : 1);
}
