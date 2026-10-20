import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/core', () => core);

import { tools } from './workspace-tools';

beforeEach(() => {
  core.invoke.mockReset().mockResolvedValue('ok');
  core.isTauri.mockReturnValue(true);
});

describe('ponte nativa', () => {
  it.each([
    [() => tools.currentWorkspace(), 'get_workspace', undefined],
    [() => tools.gitStatus(), 'git_status', undefined],
    [() => tools.gitAction('commit', { message: 'm' }), 'git_action', { action: 'commit', message: 'm' }],
    [() => tools.gitDiff('a.ts', true), 'git_diff', { path: 'a.ts', staged: true }],
    [() => tools.terminal('ls'), 'run_terminal', { command: 'ls' }],
    [() => tools.catalog(), 'model_catalog', undefined],
    [() => tools.liveReload(), 'live_reload', undefined],
    [() => tools.scripts(), 'project_scripts', undefined],
    [() => tools.start('static', 'index.html'), 'project_start', { kind: 'static', script: 'index.html' }],
    [() => tools.state(), 'project_state', undefined],
    [() => tools.stop(), 'project_stop', undefined],
    [() => tools.openBrowser('http://localhost:1'), 'open_preview_browser', { url: 'http://localhost:1' }],
  ])('%#: chama o comando Rust certo', async (call, command, args) => {
    await call();
    expect(core.invoke).toHaveBeenCalledWith(command, args);
  });

  it('fora do app instalado recusa sem chamar o Rust', async () => {
    core.isTauri.mockReturnValue(false);
    await expect(tools.gitStatus()).rejects.toThrow('aplicativo instalado');
    expect(core.invoke).not.toHaveBeenCalled();
  });
});
