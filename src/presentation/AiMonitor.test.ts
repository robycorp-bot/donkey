// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';
import { aiRequest } from '../test/fixtures';

vi.mock('../infrastructure/gateway', () => ({ gateway: { isPreview: false } }));
vi.mock('../infrastructure/workspace-tools', () => ({ tools: {} }));

import AiMonitor from './AiMonitor.svelte';
import * as ai from './ai-store';

const DAY = 86_400_000;
beforeEach(() => {
  ai.requests.set([]);
  ai.activity.set([]);
  ai.dailyBudget.set(0);
  ai.pending.set({});
  ai.selectedProvider.set('openai');
  ai.models.update((m) => ({ ...m, openai: 'gpt-4.1-mini' }));
});

describe('Monitor de IA', () => {
  it('mostra o que roda agora e o estado da chave', () => {
    ai.providerStatus.update((s) => ({ ...s, openai: { configured: true, hint: '…abcd' } }));
    render(AiMonitor);
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('gpt-4.1-mini', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText(/chave …abcd/)).toBeTruthy();
    expect(screen.getByText('ocioso')).toBeTruthy();
  });

  it('soma gasto de hoje, 30 dias e total, contando erros', () => {
    ai.requests.set([
      aiRequest({ costUsd: 0.5 }),
      aiRequest({ costUsd: 0.25, time: Date.now() - 5 * DAY }),
      aiRequest({ costUsd: 1, time: Date.now() - 60 * DAY }),
      aiRequest({ status: 'error', costUsd: null, error: 'cota' }),
    ]);
    render(AiMonitor);
    const kpi = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(kpi('Hoje')).toBe('US$ 0.500');
    expect(kpi('30 dias')).toBe('US$ 0.750');
    expect(kpi('Total geral')).toBe('US$ 1.75');
    expect(kpi('Requisições hoje')).toContain('1 erro');
  });

  it('avisa quando há respostas sem preço conhecido', () => {
    ai.requests.set([aiRequest({ costUsd: null })]);
    render(AiMonitor);
    expect(screen.getByText(/sem preço conhecido/)).toBeTruthy();
  });

  it('limite diário edita o store e mostra a porcentagem usada', async () => {
    ai.requests.set([aiRequest({ costUsd: 0.5 })]);
    render(AiMonitor);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('sem');
    await user.type(input, '2');
    input.dispatchEvent(new Event('change'));
    expect(get(ai.dailyBudget)).toBe(2);
    expect(await screen.findByText(/25% usado/)).toBeTruthy();
  });

  it('agrupa por modelo, lista requisições e alterna para ações', async () => {
    ai.requests.set([
      aiRequest({ model: 'caro', costUsd: 2 }),
      aiRequest({ model: 'barato', costUsd: 0.1 }),
      aiRequest({ model: 'livre:free', provider: 'minhavida', costUsd: 0 }),
      aiRequest({ model: 'quebrado', status: 'error', costUsd: null, error: 'Limite' }),
    ]);
    ai.activity.set([{ time: Date.now(), kind: 'git', message: 'commit: ajusta' }]);
    render(AiMonitor);
    const models = [...document.querySelectorAll('.aim-model .aim-row span')].map((e) => e.textContent);
    expect(models.slice(0, 2)).toEqual(['caro', 'barato']);
    expect(screen.getAllByText('grátis').length).toBeGreaterThan(0);
    expect(screen.getByText('Limite')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ações/ }));
    expect(screen.getByText('commit: ajusta')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Limpar ações' }));
    expect(get(ai.activity)).toEqual([]);
  });

  it('limpa o histórico de requisições', async () => {
    ai.requests.set([aiRequest()]);
    render(AiMonitor);
    await userEvent.setup().click(screen.getByRole('button', { name: /Limpar histórico/ }));
    expect(get(ai.requests)).toEqual([]);
  });

  it('indica uso enquanto uma resposta está a caminho', () => {
    ai.pending.set({ openai: true });
    render(AiMonitor);
    expect(screen.getByText('em uso')).toBeTruthy();
  });
});
