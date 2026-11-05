import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { gitState as fixture } from '../test/fixtures';

const tools = vi.hoisted(() => ({ gitStatus: vi.fn(), gitAction: vi.fn() }));
const track = vi.hoisted(() => vi.fn());
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));
vi.mock('./ai-store', () => ({ track }));

import { gitAct, gitBusy, gitHooks, gitMessage, gitState, refreshGit } from './git-store';

beforeEach(() => {
  tools.gitStatus.mockReset().mockResolvedValue(fixture());
  tools.gitAction.mockReset().mockResolvedValue(undefined);
  track.mockReset();
  gitHooks.hasUnsaved = () => false;
  gitHooks.onWorktreeChanged = vi.fn(async () => {});
  gitHooks.onBusyChange = vi.fn();
  gitMessage.set(null);
  gitState.set(null);
});

describe('git-store', () => {
  it('atualiza o estado e só mostra erro quando não é silencioso', async () => {
    await refreshGit();
    expect(get(gitState)?.branch).toBe('main');
    tools.gitStatus.mockRejectedValue(new Error('sem git'));
    await refreshGit(true);
    expect(get(gitMessage)).toBeNull();
    await refreshGit();
    expect(get(gitMessage)).toEqual({ kind: 'error', text: 'sem git' });
  });

  it('commit executa, avisa, registra a ação e recarrega o estado', async () => {
    expect(await gitAct('commit', { message: 'Linha 1\nDetalhe' })).toBe(true);
    expect(tools.gitAction).toHaveBeenCalledWith('commit', { message: 'Linha 1\nDetalhe' });
    expect(get(gitMessage)).toEqual({ kind: 'success', text: 'Commit criado.' });
    expect(track).toHaveBeenCalledWith('git', 'commit: Linha 1');
    expect(gitHooks.onBusyChange).toHaveBeenNthCalledWith(1, true);
    expect(gitHooks.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(get(gitBusy)).toBe(false);
    expect(gitHooks.onWorktreeChanged).not.toHaveBeenCalled();
  });

  it.each(['switch', 'pull', 'sync', 'branch'] as const)(
    '%s é bloqueado com arquivos sem salvar e recarrega a árvore quando roda',
    async (action) => {
      gitHooks.hasUnsaved = () => true;
      expect(await gitAct(action, { branch: 'dev' })).toBe(false);
      expect(tools.gitAction).not.toHaveBeenCalled();
      expect(get(gitMessage)?.kind).toBe('error');
      gitHooks.hasUnsaved = () => false;
      expect(await gitAct(action, { branch: 'dev' })).toBe(true);
      expect(gitHooks.onWorktreeChanged).toHaveBeenCalledOnce();
    },
  );

  it('falhas viram mensagem de erro e ficam na linha do tempo', async () => {
    tools.gitAction.mockRejectedValue(new Error('As branches divergiram.'));
    expect(await gitAct('push')).toBe(false);
    expect(get(gitMessage)).toEqual({ kind: 'error', text: 'As branches divergiram.' });
    expect(track).toHaveBeenCalledWith('git', 'push falhou: As branches divergiram.');
    expect(get(gitBusy)).toBe(false);
  });

  it('ignora cliques repetidos enquanto uma operação roda', async () => {
    let finish!: () => void;
    tools.gitAction.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const first = gitAct('push');
    expect(await gitAct('push')).toBe(false);
    await refreshGit();
    expect(tools.gitStatus).not.toHaveBeenCalled();
    finish();
    expect(await first).toBe(true);
    expect(tools.gitAction).toHaveBeenCalledTimes(1);
  });
});
