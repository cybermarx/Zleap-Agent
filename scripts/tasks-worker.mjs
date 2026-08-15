#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
process.env.ZLEAP_REPO_ROOT ??= REPO_ROOT;

const { runDevWorker } = await import(pathToFileURL(join(REPO_ROOT, 'packages/host/dist/dev.js')).href);

runDevWorker({ repoRoot: REPO_ROOT }).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
