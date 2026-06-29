import fs from 'fs';
import os from 'os';
import path from 'path';

const TEMP_ROOT_NAME = 'ai-ugc-temp';
const DEFAULT_STALE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

let hasPrunedStaleArtifacts = false;

function ensureTempRoot(): string {
  const root = path.join(os.tmpdir(), TEMP_ROOT_NAME);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function getStaleMaxAgeMs(): number {
  const raw = process.env.AI_UGC_TEMP_MAX_AGE_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_MAX_AGE_MS;
}

function sanitizeWorkspacePrefix(prefix: string): string {
  const cleaned = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'job';
}

export function pruneStaleTempArtifacts(
  rootPath = ensureTempRoot(),
  maxAgeMs = getStaleMaxAgeMs(),
  nowMs = Date.now(),
): void {
  const cutoffMs = nowMs - maxAgeMs;

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);

    let stats: fs.Stats;
    try {
      stats = fs.statSync(entryPath);
    } catch {
      continue;
    }

    if (stats.mtimeMs > cutoffMs) {
      continue;
    }

    try {
      if (stats.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(entryPath);
      }
    } catch (error) {
      console.warn(
        `[TempWorkspace] Failed to remove stale temp artifact ${entryPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export function createTempWorkspace(prefix: string): string {
  const root = ensureTempRoot();

  if (!hasPrunedStaleArtifacts) {
    hasPrunedStaleArtifacts = true;
    pruneStaleTempArtifacts(root);
  }

  return fs.mkdtempSync(path.join(root, `${sanitizeWorkspacePrefix(prefix)}-`));
}

export function cleanupTempWorkspace(workspacePath: string): void {
  try {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  } catch (error) {
    console.warn(
      `[TempWorkspace] Failed to remove temp workspace ${workspacePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
