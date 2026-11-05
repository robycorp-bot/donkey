// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const tools = vi.hoisted(() => ({ terminal: vi.fn(), liveReload: vi.fn(), gitStatus: vi.fn() }));
const track = vi.hoisted(() => vi.fn());
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));
vi.mock('./ai-store', () => ({ track }));

import TerminalPanel from './TerminalPanel.svelte';

function setup(props: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onFilesChanged = vi.fn();
  render(TerminalPanel, { cwd: 'meu-projeto', onClose, onFilesChanged, ...props });
  return { user: userEvent.setup(), onClose, onFilesChanged, input: screen.getByLabelText('Comando do terminal') };
}

beforeEach(() => {
  tools.terminal.mockReset().mockResolvedValue({ output: 'tudo certo\n', exitCode: 0, timedOut: false });
  tools.liveReload.mockReset().mockResolvedValue(undefined);
  tools.gitStatus.mockReset().mockResolvedValue(null);
  track.mockReset();
});

describe('Terminal', () => {
  it('executa o comando digitado, mostra a saída e avisa mudanças', async () => {
    const { user, input, onFilesChanged } = setup();
    await user.type(input, 'git status{Enter}');
    expect(await screen.findByText('tudo certo')).toBeTruthy();
    expect(tools.terminal).toHaveBeenCalledWith('git status');
    expect(onFilesChanged).toHaveBeenCalled();
    expect(tools.liveReload).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('terminal', 'git status → código 0');
  });

  it('mostra código de saída de falhas e tempo esgotado', async () => {
    tools.terminal.mockResolvedValueOnce({ output: 'erro feio', exitCode: 2, timedOut: false });
    const { user, input } = setup();
    await user.type(input, 'npm test{Enter}');
    expect((await screen.findByText('erro feio')).classList.contains('failed')).toBe(true);
    expect(screen.getByText(/código de saída 2/)).toBeTruthy();
    tools.terminal.mockResolvedValueOnce({ output: '', exitCode: null, timedOut: true });
    await user.type(input, 'npm run dev{Enter}');
    expect(await screen.findByText(/interrompido após 3 minutos/)).toBeTruthy();
  });

  it('atalhos rápidos rodam comandos comuns', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'git pull' }));
    expect(tools.terminal).toHaveBeenCalledWith('git pull');
  });

  it('histórico com setas e limpeza com clear', async () => {
    const { user, input } = setup();
    await user.type(input, 'echo 1{Enter}');
    await screen.findByText('tudo certo');
    await user.type(input, 'echo 2{Enter}');
    await screen.findAllByText('tudo certo');
    await user.type(input, '{ArrowUp}');
    expect((input as HTMLInputElement).value).toBe('echo 2');
    await user.type(input, '{ArrowUp}');
    expect((input as HTMLInputElement).value).toBe('echo 1');
    await user.type(input, '{ArrowDown}{ArrowDown}');
    expect((input as HTMLInputElement).value).toBe('');
    await user.type(input, 'clear{Enter}');
    expect(screen.queryByText('tudo certo')).toBeNull();
    expect(tools.terminal).toHaveBeenCalledTimes(2);
  });

  it('erros de execução aparecem como saída com falha', async () => {
    tools.terminal.mockRejectedValueOnce(new Error('Abra uma pasta de projeto primeiro.'));
    const { user, input } = setup();
    await user.type(input, 'ls{Enter}');
    expect(await screen.findByText('Abra uma pasta de projeto primeiro.')).toBeTruthy();
  });

  it('na prévia não executa nada', async () => {
    const { user, input } = setup({ isPreview: true });
    await user.type(input, 'ls{Enter}');
    expect(await screen.findByText(/aplicativo instalado/)).toBeTruthy();
    expect(tools.terminal).not.toHaveBeenCalled();
  });

  it('ignora comandos vazios e fecha pelo botão', async () => {
    const { user, input, onClose } = setup();
    await user.type(input, '   {Enter}');
    expect(tools.terminal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Fechar terminal' }));
    expect(onClose).toHaveBeenCalled();
  });
});
