// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { gitState as fixture } from '../test/fixtures';

const tools = vi.hoisted(() => ({ gitStatus: vi.fn(), gitAction: vi.fn(), gitDiff: vi.fn() }));
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));
vi.mock('./ai-store', () => ({ track: vi.fn() }));

import SourceControl from './SourceControl.svelte';
import { gitHooks, gitMessage, gitState } from './git-store';

const CHANGES = [
  { path: 'src/app.ts', previousPath: null, index: 'M', worktree: ' ' },
  { path: 'README.md', previousPath: null, index: ' ', worktree: 'M' },
  { path: 'novo.txt', previousPath: null, index: '?', worktree: '?' },
];

function setup(state = fixture({ changes: CHANGES })) {
  tools.gitStatus.mockResolvedValue(state);
  const onOpenTerminal = vi.fn();
  render(SourceControl, { onOpenTerminal });
  return { user: userEvent.setup(), onOpenTerminal };
}

beforeEach(() => {
  tools.gitStatus.mockReset();
  tools.gitAction.mockReset().mockResolvedValue(undefined);
  tools.gitDiff.mockReset();
  gitState.set(null);
  gitMessage.set(null);
  gitHooks.hasUnsaved = () => false;
  gitHooks.onWorktreeChanged = async () => {};
});

describe('Painel Git', () => {
  it('na prévia explica que o Git roda no app instalado', () => {
    render(SourceControl, { isPreview: true, onOpenTerminal: vi.fn() });
    expect(screen.getByText(/funciona no aplicativo instalado/)).toBeTruthy();
  });

  it('oferece iniciar Git em pasta sem repositório', async () => {
    const { user } = setup(fixture({ repository: false }));
    await user.click(await screen.findByRole('button', { name: 'Inicializar Git' }));
    expect(tools.gitAction).toHaveBeenCalledWith('init', {});
  });

  it('separa preparadas e alterações, com contadores', async () => {
    setup();
    await screen.findByText('app.ts');
    const counts = [...document.querySelectorAll('.scm-section b')].map((b) => b.textContent);
    expect(counts.slice(0, 2)).toEqual(['1', '2']);
    expect(screen.getByText('src')).toBeTruthy();
  });

  it('clicar no arquivo mostra o diff colorido e clicar de novo fecha', async () => {
    tools.gitDiff.mockResolvedValue('--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-velho\n+novo');
    const { user } = setup();
    await user.click(await screen.findByTitle('README.md'));
    expect(tools.gitDiff).toHaveBeenCalledWith('README.md', false);
    expect((await screen.findByText('+novo')).className).toBe('add');
    expect(screen.getByText('-velho').className).toBe('del');
    expect(screen.getByText('@@ -1 +1 @@').className).toBe('hunk');
    await user.click(screen.getByTitle('README.md'));
    expect(screen.queryByText('+novo')).toBeNull();
  });

  it('preparar e retirar arquivos chamam o Git com o caminho', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Preparar README.md' }));
    expect(tools.gitAction).toHaveBeenCalledWith('stage', { path: 'README.md' });
    await user.click(screen.getByRole('button', { name: 'Retirar src/app.ts' }));
    expect(tools.gitAction).toHaveBeenCalledWith('unstage', { path: 'src/app.ts' });
    await user.click(screen.getByRole('button', { name: '+ tudo' }));
    expect(tools.gitAction).toHaveBeenCalledWith('stage_all', {});
  });

  it('commit sem nada preparado prepara tudo antes, e Ctrl+Enter também comita', async () => {
    const { user } = setup(fixture({ changes: [CHANGES[1]] }));
    const box = await screen.findByPlaceholderText(/Mensagem do commit \(main\)/);
    await user.type(box, 'Ajusta README{Control>}{Enter}{/Control}');
    await waitFor(() => expect(tools.gitAction).toHaveBeenCalledTimes(2));
    expect(tools.gitAction.mock.calls.map((c) => c[0])).toEqual(['stage_all', 'commit']);
    expect(tools.gitAction).toHaveBeenLastCalledWith('commit', { message: 'Ajusta README' });
  });

  it('Commit e enviar faz push depois do commit', async () => {
    const { user } = setup();
    await user.type(await screen.findByPlaceholderText(/Mensagem do commit/), 'feat');
    await user.click(screen.getByRole('button', { name: /Commit e enviar/ }));
    await waitFor(() => expect(tools.gitAction.mock.calls.map((c) => c[0])).toEqual(['commit', 'push']));
  });

  it('sem remoto pede a URL do GitHub e vincula', async () => {
    const { user } = setup(fixture({ remote: false, remoteUrl: '' }));
    expect((await screen.findByRole('button', { name: /Commit e enviar/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByPlaceholderText(/github.com\/usuario/), 'https://github.com/eu/novo.git');
    await user.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(tools.gitAction).toHaveBeenCalledWith('remote', { message: 'https://github.com/eu/novo.git' });
  });

  it('com remoto mostra a URL e permite trocar', async () => {
    const { user } = setup();
    expect(await screen.findByText('https://github.com/eu/projeto.git')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'trocar' }));
    expect((screen.getByPlaceholderText(/github.com\/usuario/) as HTMLInputElement).value).toBe(
      'https://github.com/eu/projeto.git',
    );
  });

  it('troca e cria branches', async () => {
    const { user } = setup();
    await user.selectOptions(await screen.findByRole('combobox'), 'dev');
    expect(tools.gitAction).toHaveBeenCalledWith('switch', { branch: 'dev' });
    await user.type(screen.getByPlaceholderText('Nova branch'), 'feature/x');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(tools.gitAction).toHaveBeenCalledWith('branch', { branch: 'feature/x' });
  });

  it('mostra erros do Git e abre o terminal para casos avançados', async () => {
    tools.gitAction.mockRejectedValue(new Error('O Git recusou a autenticação.'));
    const { user, onOpenTerminal } = setup();
    await user.click(await screen.findByRole('button', { name: '+ tudo' }));
    expect(await screen.findByText('O Git recusou a autenticação.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Abrir terminal/ }));
    expect(onOpenTerminal).toHaveBeenCalled();
  });

  it('repositório limpo e sem commits', async () => {
    setup(fixture({ changes: [], commits: [] }));
    expect(await screen.findByText(/Tudo em dia/)).toBeTruthy();
    expect(screen.getByText('Nenhum commit ainda.')).toBeTruthy();
  });
});
