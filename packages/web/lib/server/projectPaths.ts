import { readdir, stat } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const DEFAULT_PROJECTS_ROOT = join(homedir(), '.zleap', 'project');

export function defaultSkillsRoot(): string {
  return process.env.ZLEAP_WEB_SKILLS_ROOT ?? join(homedir(), 'Documents', 'Zleap', 'skills');
}

export function resolveBrowsePath(input?: string): string {
  return resolve(input?.trim() || DEFAULT_PROJECTS_ROOT);
}

const WINDOWS_INVALID_CHARS = /[<>:"|?*]/;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function resolveChildDirectory(parentInput: string, nameInput: string): string {
  const name = nameInput.trim();
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    /[\\/\u0000-\u001f]/.test(name) ||
    (process.platform === 'win32' && (
      WINDOWS_INVALID_CHARS.test(name) ||
      /[. ]$/.test(name) ||
      WINDOWS_RESERVED_NAME.test(name)
    ))
  ) {
    throw new Error('invalid_folder_name');
  }
  return join(resolveBrowsePath(parentInput), name);
}

export type BrowseEntry = { name: string; path: string };

export async function browseDirectories(inputPath?: string): Promise<{
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}> {
  const current = resolveBrowsePath(inputPath);
  const info = await stat(current);
  if (!info.isDirectory()) {
    throw new Error('not_a_directory');
  }

  const parent = dirname(current);
  const entries = await readdir(current, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, path: join(current, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    path: current,
    parent: parent !== current ? parent : null,
    entries: dirs,
  };
}

export async function listProjectRoots(): Promise<BrowseEntry[]> {
  const roots: BrowseEntry[] = [{ name: basename(homedir()), path: homedir() }];

  if (process.platform === 'win32') {
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const drivePath = `${letter}:\\`;
      try {
        const info = await stat(drivePath);
        if (info.isDirectory()) {
          roots.push({ name: `${letter}:`, path: drivePath });
        }
      } catch {
        // drive does not exist or no access; skip
      }
    }
  } else {
    roots.push({ name: '/', path: '/' });
    const mountDirs = ['/Volumes', '/mnt', `/media/${userInfo().username}`];
    for (const mountDir of mountDirs) {
      try {
        const entries = await readdir(mountDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            roots.push({ name: e.name, path: join(mountDir, e.name) });
          }
        }
      } catch {
        // mount dir does not exist or no access; skip
      }
    }
  }

  const seen = new Set<string>();
  return roots.filter((r) => {
    if (seen.has(r.path)) return false;
    seen.add(r.path);
    return true;
  });
}
