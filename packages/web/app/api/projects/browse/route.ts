import { mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { isActorResponse, requireHttpActor } from '../../../../lib/server/actor';
import {
  browseDirectories,
  DEFAULT_PROJECTS_ROOT,
  defaultSkillsRoot,
  listProjectRoots,
  resolveChildDirectory,
} from '../../../../lib/server/projectPaths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List child directories for the project folder picker (server-side, any absolute path). */
export async function GET(req: Request): Promise<Response> {
  const actor = requireHttpActor(req);
  if (isActorResponse(actor)) return actor;
  const url = new URL(req.url);
  const preset = url.searchParams.get('preset');
  const presetPath = preset === 'skills' ? defaultSkillsRoot() : homedir();
  const path = url.searchParams.get('path') ?? presetPath;
  try {
    await mkdir(DEFAULT_PROJECTS_ROOT, { recursive: true });
    if (preset === 'skills' && !url.searchParams.has('path')) {
      await mkdir(presetPath, { recursive: true });
    }
    const [result, roots] = await Promise.all([browseDirectories(path), listProjectRoots()]);
    return Response.json({ root: DEFAULT_PROJECTS_ROOT, ...result, roots });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const actor = requireHttpActor(req, { roles: ['admin'] });
  if (isActorResponse(actor)) return actor;

  try {
    const raw = await req.json();
    if (!raw || typeof raw !== 'object') {
      return Response.json({ error: 'parent_required' }, { status: 400 });
    }
    const body = raw as { parent?: unknown; name?: unknown };
    if (typeof body.parent !== 'string' || !body.parent.trim()) {
      return Response.json({ error: 'parent_required' }, { status: 400 });
    }
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return Response.json({ error: 'folder_name_required' }, { status: 400 });
    }

    const target = resolveChildDirectory(body.parent, body.name);
    const parentInfo = await stat(dirname(target));
    if (!parentInfo.isDirectory()) {
      return Response.json({ error: 'parent_not_directory' }, { status: 400 });
    }

    await mkdir(target);
    return Response.json({ path: target }, { status: 201 });
  } catch (error) {
    const fsCode = error && typeof error === 'object'
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    if (error instanceof Error && error.message === 'invalid_folder_name') {
      return Response.json({ error: 'invalid_folder_name' }, { status: 400 });
    }
    if (fsCode === 'ENOENT') return Response.json({ error: 'parent_not_found' }, { status: 400 });
    if (fsCode === 'ENOTDIR') return Response.json({ error: 'parent_not_directory' }, { status: 400 });
    if (fsCode === 'EEXIST') return Response.json({ error: 'folder_exists' }, { status: 409 });
    if (fsCode === 'EACCES' || fsCode === 'EPERM') {
      return Response.json({ error: 'folder_permission_denied' }, { status: 403 });
    }
    return Response.json({ error: 'folder_create_failed' }, { status: 400 });
  }
}
