// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const tools = vi.hoisted(() => ({ openBrowser: vi.fn() }));
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));
import PreviewPane from './PreviewPane.svelte';

describe('Prévia', () => {
  it('mostra a página num iframe isolado, recarrega, abre no navegador e fecha', async () => {
    const onClose = vi.fn();
    render(PreviewPane, { url: 'http://127.0.0.1:5500/', onClose });
    const user = userEvent.setup();
    const frame = screen.getByTitle('Prévia do projeto') as HTMLIFrameElement;
    expect(frame.src).toBe('http://127.0.0.1:5500/');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    await user.click(screen.getByRole('button', { name: 'Atualizar prévia' }));
    expect(screen.getByTitle('Prévia do projeto')).not.toBe(frame);
    await user.click(screen.getByRole('button', { name: 'No navegador' }));
    expect(tools.openBrowser).toHaveBeenCalledWith('http://127.0.0.1:5500/');
    await user.click(screen.getByRole('button', { name: 'Voltar ao código' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('mostra erro se o navegador não abrir', async () => {
    tools.openBrowser.mockRejectedValueOnce('bloqueado');
    render(PreviewPane, { url: 'http://localhost:1/', onClose: vi.fn() });
    await userEvent.setup().click(screen.getByRole('button', { name: 'No navegador' }));
    expect(await screen.findByText('bloqueado')).toBeTruthy();
  });
});
