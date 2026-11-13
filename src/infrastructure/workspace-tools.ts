import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Workspace } from '../domain/models';
import type {
  PtyShell,
  CatalogModel,
  GitAction,
  GitState,
  ProjectScript,
  ProjectState,
  TerminalResult,
} from '../domain/workspace-tools';
function native<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject(
      new Error('Use o aplicativo instalado para acessar o Git e executar seus projetos.'),
    );
  return invoke<T>(command, args);
}
export const tools = {
  currentWorkspace: () => native<Workspace | null>('get_workspace'),
  gitStatus: () => native<GitState>('git_status'),
  gitAction: (action: GitAction, args: { path?: string; message?: string; branch?: string } = {}) =>
    native<void>('git_action', { action, ...args }),
  scripts: () => native<ProjectScript[]>('project_scripts'),
  start: (kind: 'static' | 'script' | 'install', script?: string) =>
    native<ProjectState>('project_start', { kind, script }),
  state: () => native<ProjectState>('project_state'),
  stop: () => native<void>('project_stop'),
  gitDiff: (path: string, staged: boolean) => native<string>('git_diff', { path, staged }),
  terminal: (command: string) => native<TerminalResult>('run_terminal', { command }),
  ptyOpen: (shell: PtyShell, cols: number, rows: number) => native<number>('pty_open', { shell, cols, rows }),
  ptyWrite: (id: number, data: string) => native<void>('pty_write', { id, data }),
  ptyResize: (id: number, cols: number, rows: number) => native<void>('pty_resize', { id, cols, rows }),
  ptyClose: (id: number) => native<void>('pty_close', { id }),
  onPtyOutput: (handler: (id: number, data: string) => void): Promise<UnlistenFn> =>
    listen<{ id: number; data: string }>('pty-output', (event) => handler(event.payload.id, event.payload.data)),
  onPtyExit: (handler: (id: number) => void): Promise<UnlistenFn> =>
    listen<{ id: number }>('pty-exit', (event) => handler(event.payload.id)),
  catalog: () => native<CatalogModel[]>('model_catalog'),
  liveReload: () => native<void>('live_reload'),
  openBrowser: (url: string) => native<void>('open_preview_browser', { url }),
};
