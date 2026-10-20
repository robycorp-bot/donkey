// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const tools = vi.hoisted(() => ({
  scripts: vi.fn(),
  start: vi.fn(),
  state: vi.fn(),
  stop: vi.fn(),
  openBrowser: vi.fn(),
}));
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));
import RunPanel from './RunPanel.svelte';

const idle = { running: false, label: '', url: null, logs: [], exitCode: null };
beforeEach(() => {
  tools.scripts.mockReset().mockResolvedValue([
    { name: 'build', command: 'vite build' },
    { name: 'dev', command: 'vite' },
  ]);
  tools.state.mockReset().mockResolvedValue(idle);
  tools.start.mockReset();
  tools.stop.mockReset().mockResolvedValue(undefined);
  tools.openBrowser.mockReset().mockResolvedValue(undefined);
});

describe('Executar projeto', () => {
  it('na prévia explica que precisa do app', () => {
    render(RunPanel, { isPreview: true, onPreview: vi.fn() });
    expect(screen.getByText(/disponíveis no aplicativo instalado/)).toBeTruthy();
    expect(tools.scripts).not.toHaveBeenCalled();
  });

  it('pré-seleciona o script dev e executa', async () => {
    tools.start.mockResolvedValue({ running: true, label: 'npm run dev', url: 'http://localhost:5173/', logs: ['pronto'], exitCode: null });
    render(RunPanel, { onPreview: vi.fn() });
    const user = userEvent.setup();
    await waitFor(() => expect((screen.getByLabelText('Script do package.json') as HTMLSelectElement).value).toBe('dev'));
    await user.click(screen.getByRole('button', { name: 'Executar script' }));
    expect(tools.start).toHaveBeenCalledWith('script', 'dev');
    expect((screen.getByLabelText('Endereço da prévia') as HTMLInputElement).value).toBe('http://localhost:5173/');
  });

  it('Live Server, prévia no editor e no navegador', async () => {
    tools.start.mockResolvedValue({ running: true, label: 'Live Server', url: 'http://127.0.0.1:4000/', logs: [], exitCode: null });
    const onPreview = vi.fn();
    render(RunPanel, { onPreview });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Live Server' }));
    expect(tools.start).toHaveBeenCalledWith('static', 'dev');
    await user.click(screen.getByRole('button', { name: 'Ver no editor' }));
    expect(onPreview).toHaveBeenCalledWith('http://127.0.0.1:4000/');
    await user.click(screen.getByRole('button', { name: 'Abrir no navegador' }));
    expect(tools.openBrowser).toHaveBeenCalledWith('http://127.0.0.1:4000/');
  });

  it('recusa prévia fora do localhost', async () => {
    const onPreview = vi.fn();
    render(RunPanel, { onPreview });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Endereço da prévia'), 'https://exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Ver no editor' }));
    expect(onPreview).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('sem package.json avisa e mostra falhas ao iniciar', async () => {
    tools.scripts.mockRejectedValue(new Error('sem package'));
    tools.start.mockRejectedValue(new Error('Não achei esse HTML.'));
    render(RunPanel, { onPreview: vi.fn() });
    expect(await screen.findByText(/Sem package.json na raiz/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Live Server' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Não achei esse HTML.');
  });

  it('acompanha os logs e para a execução', async () => {
    tools.state.mockResolvedValue({ running: true, label: 'npm run dev', url: null, logs: ['linha A', 'linha B'], exitCode: null });
    render(RunPanel, { onPreview: vi.fn() });
    expect(await screen.findByText(/linha A\s+linha B/)).toBeTruthy();
    expect(screen.getByText('npm run dev')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Parar' }));
    expect(tools.stop).toHaveBeenCalled();
  });

  it('mostra o código de saída quando o processo termina', async () => {
    tools.state.mockResolvedValue({ ...idle, exitCode: 1 });
    render(RunPanel, { onPreview: vi.fn() });
    expect(await screen.findByText('Encerrado · código 1')).toBeTruthy();
  });
});
