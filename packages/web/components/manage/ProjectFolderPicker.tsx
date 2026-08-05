'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, Folder, FolderPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { postJson, webApiFetch } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type BrowseEntry = { name: string; path: string };

type BrowseResult = {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  roots?: BrowseEntry[];
};

type ProjectFolderPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPath?: string;
  defaultPreset?: 'skills';
  onSelect: (path: string) => void;
  allowCreateFolder?: boolean;
};

/** Server-backed directory browser — Codex-style folder picker for local paths. */
export function ProjectFolderPicker({
  open,
  onOpenChange,
  initialPath,
  defaultPreset,
  onSelect,
  allowCreateFolder = false,
}: ProjectFolderPickerProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [creatingNewFolder, setCreatingNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const [creatingFolderRequest, setCreatingFolderRequest] = useState(false);

  const resetCreateFolder = useCallback(() => {
    setCreatingNewFolder(false);
    setNewFolderName('');
    setCreateFolderError(null);
  }, []);

  const load = useCallback(async (path?: string) => {
    resetCreateFolder();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (path) {
        params.set('path', path);
      } else if (defaultPreset) {
        params.set('preset', defaultPreset);
      }
      const suffix = params.size ? `?${params.toString()}` : '';
      const res = await webApiFetch(`/api/projects/browse${suffix}`);
      const body = (await res.json()) as BrowseResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setBrowse(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [defaultPreset, resetCreateFolder]);

  useEffect(() => {
    if (!open) return;
    void load(initialPath);
  }, [open, initialPath, load]);

  useEffect(() => {
    if (browse?.path) setAddress(browse.path);
  }, [browse?.path]);

  const cancelCreateFolder = () => {
    if (!creatingFolderRequest) resetCreateFolder();
  };

  const handlePickerOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && creatingFolderRequest) return;
    if (!nextOpen) resetCreateFolder();
    onOpenChange(nextOpen);
  };

  const createFolder = async () => {
    const parent = browse?.path;
    const name = newFolderName.trim();
    if (!parent) return;
    if (!name) {
      setCreateFolderError(t('project.folderNameRequired'));
      return;
    }

    setCreatingFolderRequest(true);
    setCreateFolderError(null);
    try {
      const body = await postJson('/api/projects/browse', { parent, name }) as { path?: unknown };
      if (typeof body.path !== 'string' || !body.path) throw new Error('folder_create_failed');
      onSelect(body.path);
      resetCreateFolder();
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'folder_create_failed';
      const key = folderErrorKey(code) ?? 'project.folderCreateFailed';
      setCreateFolderError(t(key));
    } finally {
      setCreatingFolderRequest(false);
    }
  };

  const confirm = () => {
    if (!browse?.path) return;
    onSelect(browse.path);
    handlePickerOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handlePickerOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('project.selectFolder')}</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">{browse?.path ?? '…'}</DialogDescription>
        </DialogHeader>

        {browse?.roots?.length ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">{t('project.quickAccess')}</span>
            {browse.roots.map((root) => (
              <Button
                key={root.path}
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || creatingNewFolder || creatingFolderRequest}
                onClick={() => load(root.path)}
              >
                {root.name}
              </Button>
            ))}
          </div>
        ) : null}

        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const trimmed = address.trim();
              if (trimmed) load(trimmed);
            }
          }}
          disabled={creatingNewFolder || creatingFolderRequest}
          className="font-mono text-xs"
          placeholder={browse?.path ?? ''}
        />

        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={!browse?.parent || loading || creatingNewFolder || creatingFolderRequest}
            onClick={() => browse?.parent && load(browse.parent)}
            title={t('common.back')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{browse?.path}</span>
          {allowCreateFolder && !creatingNewFolder ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!browse?.path || loading || creatingFolderRequest}
              onClick={() => {
                setCreatingNewFolder(true);
                setNewFolderName('');
                setCreateFolderError(null);
              }}
              aria-label={t('project.newFolder')}
            >
              <FolderPlus className="size-3.5" />
              {t('project.newFolder')}
            </Button>
          ) : null}
        </div>

        {allowCreateFolder && creatingNewFolder ? (
          <div className="rounded-lg border border-border bg-muted/30 p-2">
            <div className="mb-1 truncate text-xs text-muted-foreground">
              {t('project.newFolderHint', { path: browse?.path ?? '' })}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newFolderName}
                autoFocus
                disabled={creatingFolderRequest}
                placeholder={t('project.newFolderPlaceholder')}
                aria-label={t('project.newFolderPlaceholder')}
                onChange={(event) => {
                  setNewFolderName(event.target.value);
                  setCreateFolderError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void createFolder();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelCreateFolder();
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={creatingFolderRequest}
                onClick={cancelCreateFolder}
                title={t('common.cancel')}
              >
                <X className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={creatingFolderRequest || !newFolderName.trim()}
                onClick={() => void createFolder()}
              >
                <Check className="size-3.5" />
                {t('project.createAndUse')}
              </Button>
            </div>
            {createFolderError ? <p className="mt-1 text-xs text-destructive">{createFolderError}</p> : null}
          </div>
        ) : null}

        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : error ? (
            <div className="px-3 py-6 text-center text-sm text-destructive">{error}</div>
          ) : browse?.entries.length ? (
            browse.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                disabled={creatingNewFolder || creatingFolderRequest}
                onClick={() => load(entry.path)}
                className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{entry.name}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t('project.emptyFolder')}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handlePickerOpenChange(false)} disabled={creatingFolderRequest}>{t('common.cancel')}</Button>
          <Button onClick={confirm} disabled={!browse?.path || loading || creatingNewFolder || creatingFolderRequest}>{t('project.useFolder')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function folderErrorKey(code: string): string | null {
  switch (code) {
    case 'folder_name_required': return 'project.folderNameRequired';
    case 'folder_exists': return 'project.folderExists';
    case 'invalid_folder_name': return 'project.invalidFolderName';
    case 'parent_not_found': return 'project.parentNotFound';
    case 'parent_not_directory': return 'project.parentNotDirectory';
    case 'folder_permission_denied': return 'project.folderPermissionDenied';
    case 'folder_create_failed': return 'project.folderCreateFailed';
    default: return null;
  }
}
