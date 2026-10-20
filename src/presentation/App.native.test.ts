// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { gitState as gitFixture } from '../test/fixtures';

vi.mock('./CodeEditor.svelte', async () => ({
  default: (await import('../test/CodeEditorStub.svelte')).default,
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async () => () => {},
    close: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
  }),
}));

const ROOT = 'C:\\proj';
const files: Record<string, string> = {
  [`${ROOT}\\index.html`]: '<h1>oi</h1>',
  [`${ROOT}\\paginas\\sobre.html`]: '<p>sobre</p>',
};
const gateway = vi.hoisted(() => ({
  isPreview: false,
  openWorkspace: vi.fn(),
  listDirectory: vi.fn(),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  getProviderStatuses: vi.fn(),
  configureProvider: vi.fn(),
  removeProvider: vi.fn(),
  chat: vi.fn(),
}));
const tools = vi.hoisted(() => ({
  currentWorkspace: vi.fn(),
  gitStatus: vi.fn(),
  gitAction: vi.fn(),
  gitDiff: vi.fn(),
  terminal: vi.fn(),
  catalog: vi.fn(),
  liveReload: vi.fn(),
  scripts: vi.fn(),
  start: vi.fn(),
  state: vi.fn(),
  stop: vi.fn(),
  openBrowser: vi.fn(),
}));
vi.mock('../infrastructure/gateway', () => ({ gateway, appGateway: gateway }));
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));

import App from './App.svelte';

beforeEach(() => {
  Object.values(gateway).forEach((f) => typeof f === 'function' && (f as ReturnType<typeof vi.fn>).mockReset());
  Object.values(tools).forEach((f) => f.mockReset());
  const entries = [
    { name: 'paginas', path: `${ROOT}\\paginas`, isDirectory: true },
    { name: 'index.html', path: `${ROOT}\\index.html`, isDirectory: false },
  ];
  tools.currentWorkspace.mockResolvedValue({ name: 'proj', path: ROOT, entries });
  gateway.listDirectory.mockImplementation(async (path: string) =>
    path === ROOT ? entries : [{ name: 'sobre.html', path: `${ROOT}\\paginas\\sobre.html`, isDirectory: false }],
  );
  gateway.readFile.mockImplementation(async (path: string) => ({
    path,
    name: path.split('\\').pop(),
    content: files[path],
    language: 'html',
  }));
  gateway.getProviderStatuses.mockResolvedValue([{ id: 'openai', configured: false }]);
  tools.gitStatus.mockResolvedValue(gitFixture({ changes: [{ path: 'a', previousPath: null, index: ' ', worktree: 'M' }], ahead: 2, behind: 1 }));
  tools.gitAction.mockResolvedValue(undefined);
  tools.catalog.mockResolvedValue([]);
  tools.state.mockResolvedValue({ running: false, label: '', url: null, logs: [], exitCode: null });
  tools.liveReload.mockResolvedValue(undefined);
});

async function boot() {
  const user = userEvent.setup();
  render(App);
  await screen.findByText('main', { selector: '.git-chip span' });
  return user;
}

describe('App · modo instalado', () => {
  it('restaura a pasta e mostra branch, alterações e commits pendentes no topo', async () => {
    await boot();
    const chip = screen.getByTitle('Controle de versão · Ctrl Shift G');
    expect(chip.textContent).toContain('main');
    expect(chip.textContent).toContain('1');
    expect(chip.textContent).toContain('↑2');
    expect(chip.textContent).toContain('↓1');
  });

  it('Pull, Push e Sincronizar chamam o Git', async () => {
    const user = await boot();
    await user.click(screen.getByRole('button', { name: '↓ Pull' }));
    await user.click(screen.getByRole('button', { name: '↑ Push' }));
    await user.click(screen.getByTitle('Sincronizar: pull e depois push'));
    await waitFor(() => expect(tools.gitAction.mock.calls.map((c) => c[0])).toEqual(['pull', 'push', 'sync']));
  });

  it('sem remoto os botões de envio ficam desativados', async () => {
    tools.gitStatus.mockResolvedValue(gitFixture({ remote: false }));
    await boot();
    expect((screen.getByRole('button', { name: '↑ Push' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('o chip do Git abre a aba Git na lateral', async () => {
    const user = await boot();
    await user.click(screen.getByTitle('Controle de versão · Ctrl Shift G'));
    expect(screen.getByRole('tab', { name: /Git/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('Live Server abre o HTML aberto pelo caminho relativo e mostra a prévia', async () => {
    tools.start.mockResolvedValue({ running: true, label: 'Live Server', url: 'http://127.0.0.1:5000/paginas/sobre.html', logs: [], exitCode: null });
    const user = await boot();
    await user.click(screen.getByTitle('paginas'));
    await user.click(await screen.findByTitle('sobre.html'));
    await user.click(screen.getByRole('button', { name: /Live Server/ }));
    expect(tools.start).toHaveBeenCalledWith('static', 'paginas/sobre.html');
    expect(((await screen.findByTitle('Prévia do projeto')) as HTMLIFrameElement).src).toBe(
      'http://127.0.0.1:5000/paginas/sobre.html',
    );
    await user.click(screen.getByRole('button', { name: /Ao vivo/ }));
    expect(tools.stop).toHaveBeenCalled();
    expect(screen.queryByTitle('Prévia do projeto')).toBeNull();
  });

  it('Live Server sem HTML aberto usa index.html e mostra erros', async () => {
    tools.start.mockRejectedValue(new Error('Não achei esse HTML.'));
    const user = await boot();
    await user.click(screen.getByRole('button', { name: /Live Server/ }));
    expect(tools.start).toHaveBeenCalledWith('static', undefined);
    expect(await screen.findByText('Não achei esse HTML.')).toBeTruthy();
  });

  it('salvar avisa o Live Server e atualiza o Git', async () => {
    gateway.saveFile.mockResolvedValue(undefined);
    const user = await boot();
    await user.click(screen.getByTitle('index.html'));
    await fireEvent.input(await screen.findByLabelText('editor'), { target: { value: '<h1>novo</h1>' } });
    tools.gitStatus.mockClear();
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(gateway.saveFile).toHaveBeenCalled());
    expect(gateway.saveFile.mock.calls[0][1]).toBe('<h1>novo</h1>\n');
    await waitFor(() => expect(tools.gitStatus).toHaveBeenCalled());
  });

  it('guardar chave chama o cofre e atualiza o status mascarado', async () => {
    gateway.configureProvider.mockResolvedValue(undefined);
    const user = await boot();
    await user.click(screen.getByRole('button', { name: 'Configurações de IA' }));
    const dialog = screen.getByRole('dialog', { name: 'Configurações de IA' });
    await user.click(within(dialog).getByRole('button', { name: 'Codex' }));
    gateway.getProviderStatuses.mockResolvedValue([{ id: 'openai', configured: true, hint: '…beef' }]);
    await user.type(within(dialog).getByLabelText(/Chave da API/), 'sk-proj-abc');
    await user.click(within(dialog).getByRole('button', { name: /Guardar chave/ }));
    expect(gateway.configureProvider).toHaveBeenCalledWith('openai', 'sk-proj-abc');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/1 de 4 IAs conectadas/)).toBeTruthy();
  });

  it('erro ao guardar chave aparece e a janela continua aberta', async () => {
    gateway.configureProvider.mockRejectedValue(new Error('Essa chave não parece ser deste provedor'));
    const user = await boot();
    await user.click(screen.getByRole('button', { name: 'Configurações de IA' }));
    const dialog = screen.getByRole('dialog', { name: 'Configurações de IA' });
    await user.type(within(dialog).getByLabelText(/Chave da API/), 'sk-errada');
    await user.click(within(dialog).getByRole('button', { name: /Guardar chave/ }));
    expect(await screen.findByText(/não parece ser deste provedor/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('remover chave chama o cofre', async () => {
    gateway.getProviderStatuses.mockResolvedValue([{ id: 'minhavida', configured: true, hint: '…1111' }]);
    gateway.removeProvider.mockResolvedValue(undefined);
    const user = await boot();
    await user.click(screen.getByRole('button', { name: 'Configurações de IA' }));
    expect(screen.getByLabelText(/atual …1111/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remover chave' }));
    expect(gateway.removeProvider).toHaveBeenCalledWith('minhavida');
  });

  it('código da IA é inserido no arquivo aberto', async () => {
    gateway.getProviderStatuses.mockResolvedValue([{ id: 'minhavida', configured: true }]);
    gateway.chat.mockResolvedValue({ text: '```html\n<b>x</b>\n```', model: 'm:free', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1 });
    const user = await boot();
    await user.click(screen.getByTitle('index.html'));
    await user.click(screen.getByRole('button', { name: /Central IA/ }));
    await user.type(screen.getByPlaceholderText(/Peça, pergunte/), 'gera{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Inserir no cursor' }));
    expect((screen.getByLabelText('editor') as HTMLTextAreaElement).value).toBe('<h1>oi</h1><b>x</b>');
    expect(screen.getByText(/Código inserido em index.html/)).toBeTruthy();
  });

  it('pasta sem Git oferece iniciar', async () => {
    tools.gitStatus.mockResolvedValue(gitFixture({ repository: false }));
    render(App);
    expect(await screen.findByText('Sem Git · iniciar')).toBeTruthy();
  });
});
