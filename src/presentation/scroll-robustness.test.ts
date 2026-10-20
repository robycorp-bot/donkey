// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const tools = vi.hoisted(() => ({
  terminal: vi.fn(async () => ({ output: 'ok', exitCode: 0, timedOut: false })),
  liveReload: vi.fn(async () => {}),
  gitStatus: vi.fn(),
}));
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));
vi.mock('./ai-store', () => ({ track: vi.fn() }));

import TerminalPanel from './TerminalPanel.svelte';

const original = Element.prototype.scrollTo;
afterEach(() => {
  Element.prototype.scrollTo = original;
});

describe('regressão: rolagem nunca trava o terminal', () => {
  it('executa mesmo se scrollTo lançar erro', async () => {
    Element.prototype.scrollTo = () => {
      throw new Error('sem layout');
    };
    render(TerminalPanel, { onClose: vi.fn(), onFilesChanged: vi.fn() });
    await userEvent.setup().click(screen.getByRole('button', { name: 'git status' }));
    expect(await screen.findByText('ok')).toBeTruthy();
    expect(tools.terminal).toHaveBeenCalledWith('git status');
    expect((screen.getByLabelText('Comando do terminal') as HTMLInputElement).disabled).toBe(false);
  });
});
