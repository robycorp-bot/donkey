import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Workspace } from '../domain/models';
import type {
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
  catalog: () => native<CatalogModel[]>('model_catalog'),
  liveReload: () => native<void>('live_reload'),
  openBrowser: (url: string) => native<void>('open_preview_browser', { url }),
};
