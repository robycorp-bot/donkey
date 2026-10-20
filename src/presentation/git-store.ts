import { get, writable } from 'svelte/store';
import { tools } from '../infrastructure/workspace-tools';
import type { GitAction, GitState } from '../domain/workspace-tools';
import { track } from './ai-store';

export const gitState = writable<GitState | null>(null);
export const gitBusy = writable(false);
export const gitMessage = writable<{ kind: 'error' | 'success'; text: string } | null>(null);

/** Hooks wired by App: unsaved-file guard and worktree reload after branch/pull. */
export const gitHooks = {
  hasUnsaved: () => false,
  onWorktreeChanged: async () => {},
  onBusyChange: (_busy: boolean) => {},
};

const CHANGES_TREE: GitAction[] = ['switch', 'branch', 'pull', 'sync'];
const SUCCESS: Partial<Record<GitAction, string>> = {
  commit: 'Commit criado.',
  push: 'Enviado para o GitHub.',
  pull: 'Projeto atualizado.',
  sync: 'Sincronizado: puxou e enviou.',
  fetch: 'Remoto consultado.',
  remote: 'Repositório remoto vinculado.',
  stage_all: 'Tudo preparado para o commit.',
  init: 'Git iniciado nesta pasta.',
};

export async function refreshGit(silent = false): Promise<void> {
  if (get(gitBusy)) return;
  try {
    gitState.set(await tools.gitStatus());
  } catch (error) {
    if (!silent) gitMessage.set({ kind: 'error', text: text(error) });
  }
}

export async function gitAct(
  action: GitAction,
  args: { path?: string; message?: string; branch?: string } = {},
): Promise<boolean> {
  if (get(gitBusy)) return false;
  if (CHANGES_TREE.includes(action) && gitHooks.hasUnsaved()) {
    gitMessage.set({
      kind: 'error',
      text: 'Salve ou feche os arquivos alterados antes de trocar de branch ou atualizar.',
    });
    return false;
  }
  gitBusy.set(true);
  gitHooks.onBusyChange(true);
  gitMessage.set(null);
  try {
    await tools.gitAction(action, args);
    if (CHANGES_TREE.includes(action)) await gitHooks.onWorktreeChanged();
    const message = SUCCESS[action];
    if (message) gitMessage.set({ kind: 'success', text: message });
    track('git', `${action}${args.branch ? ` ${args.branch}` : ''}${args.path ? ` ${args.path}` : ''}${action === 'commit' && args.message ? `: ${args.message.split('\n')[0].slice(0, 70)}` : ''}`);
    gitState.set(await tools.gitStatus());
    return true;
  } catch (error) {
    gitMessage.set({ kind: 'error', text: text(error) });
    track('git', `${action} falhou: ${text(error).slice(0, 80)}`);
    return false;
  } finally {
    gitBusy.set(false);
    gitHooks.onBusyChange(false);
  }
}

function text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
