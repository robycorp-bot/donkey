// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

const gateway = vi.hoisted(() => ({ isPreview: false, chat: vi.fn(), getProviderStatuses: vi.fn() }));
const tools = vi.hoisted(() => ({ catalog: vi.fn() }));
vi.mock('../infrastructure/gateway', () => ({ gateway }));
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));

import AiCenter from './AiCenter.svelte';
import * as ai from './ai-store';

const FREE = { id: 'meta/llama:free', name: 'Llama (free)', company: 'meta', free: true, inputPerMillion: 0, outputPerMillion: 0, context: 1 };
const PAID = { id: 'openai/gpt-4.1-mini', name: 'GPT mini', company: 'openai', free: false, inputPerMillion: 0.4, outputPerMillion: 1.6, context: 1 };

function setup(props: Partial<Record<string, unknown>> = {}) {
  const onConfigure = vi.fn();
  const onOpenWorkspace = vi.fn();
  const onInsertCode = vi.fn();
  render(AiCenter, { onConfigure, onOpenWorkspace, onInsertCode, hasWorkspace: true, ...props });
  return { onConfigure, onOpenWorkspace, onInsertCode, user: userEvent.setup() };
}
function connect(...ids: string[]) {
  ai.providerStatus.update((s) => {
    const next = { ...s };
    for (const id of ids) next[id as keyof typeof next] = { configured: true, hint: '…9f3a' };
    return next;
  });
}

beforeEach(() => {
  gateway.chat.mockReset();
  tools.catalog.mockReset().mockResolvedValue([FREE, PAID]);
  ai.catalogState.set('idle');
  ai.selectedProvider.set('minhavida');
  ai.conversations.update((c) => Object.fromEntries(Object.keys(c).map((k) => [k, []])) as unknown as typeof c);
  ai.chatErrors.set({});
  ai.providerStatus.update((s) => Object.fromEntries(Object.keys(s).map((k) => [k, { configured: false }])) as unknown as typeof s);
  ai.requests.set([]);
  ai.dailyBudget.set(0);
});

describe('Central de IA', () => {
  it('sem chave mostra o convite e abre a configuração do provedor certo', async () => {
    const { onConfigure, user } = setup();
    expect(screen.getByText('IA de graça, sem cartão.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Guardar minha chave/ }));
    expect(onConfigure).toHaveBeenCalledWith('minhavida');
    expect((screen.getByPlaceholderText(/Configure a chave/) as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('lista só modelos gratuitos agrupados por empresa no Modal minha vida', async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Llama' })).toBeTruthy());
    expect(screen.queryByRole('option', { name: /GPT mini/ })).toBeNull();
    expect(screen.getByText('grátis', { selector: '.aic-price' })).toBeTruthy();
  });

  it('mostra o preço por 1M tokens dos modelos pagos', async () => {
    ai.selectedProvider.set('openai');
    ai.models.update((m) => ({ ...m, openai: 'gpt-4.1-mini' }));
    setup();
    await waitFor(() => expect(screen.getByText(/US\$ 0.40 entrada · 1.60 saída/)).toBeTruthy());
  });

  it('Enter envia, Shift+Enter não, e a resposta mostra tokens, custo e tempo', async () => {
    connect('minhavida');
    gateway.chat.mockResolvedValue({ text: 'Oxe, tudo certo.', model: 'meta/llama:free', inputTokens: 1200, outputTokens: 80, costUsd: 0, latencyMs: 2300 });
    const { user } = setup();
    const box = screen.getByPlaceholderText(/Peça, pergunte/);
    await user.type(box, 'linha 1{Shift>}{Enter}{/Shift}linha 2');
    expect(gateway.chat).not.toHaveBeenCalled();
    await user.type(box, '{Enter}');
    await screen.findByText('Oxe, tudo certo.');
    expect(gateway.chat.mock.calls[0][2][0].content).toBe('linha 1\nlinha 2');
    expect(screen.getByText('1.2k entrada')).toBeTruthy();
    expect(screen.getByText('2.3 s')).toBeTruthy();
    expect(screen.getAllByText('grátis').length).toBeGreaterThan(0);
  });

  it('respostas com HTML aparecem como texto (sem injeção) e blocos de código têm ações', async () => {
    connect('minhavida');
    gateway.chat.mockResolvedValue({
      text: 'Cuidado <img src=x onerror="alert(1)"> aqui:\n```js\nconsole.log(1);\n```',
      model: 'm:free', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1,
    });
    const { user, onInsertCode } = setup();
    await user.type(screen.getByPlaceholderText(/Peça, pergunte/), 'oi{Enter}');
    await screen.findByText('console.log(1);');
    expect(document.querySelector('.aic-answer img')).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Inserir no cursor' }));
    expect(onInsertCode).toHaveBeenCalledWith('console.log(1);');
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(await navigator.clipboard.readText()).toBe('console.log(1);');
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy();
  });

  it('anexar arquivo envia o conteúdo e mostra a etiqueta do arquivo', async () => {
    connect('minhavida');
    gateway.chat.mockResolvedValue({ text: 'ok', model: 'm:free', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1 });
    const { user } = setup({ activeFile: { path: '/p/app.ts', name: 'app.ts', language: 'typescript', content: 'export const x = 1;' } });
    await user.click(screen.getByRole('button', { name: /Anexar app.ts/ }));
    expect(screen.getByRole('button', { name: /Enviando app.ts/ })).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/Peça, pergunte/), 'revise{Enter}');
    await screen.findByText('ok');
    expect(gateway.chat.mock.calls[0][2][0].content).toContain('export const x = 1;');
    expect(screen.getByText('app.ts', { selector: '.aic-attach' })).toBeTruthy();
  });

  it('atalhos que dependem de arquivo ficam desativados sem arquivo aberto', () => {
    connect('minhavida');
    setup({ hasWorkspace: false });
    expect((screen.getByRole('button', { name: 'Caçar bugs' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Ideia de projeto' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: /Abrir uma pasta/ })).toBeTruthy();
  });

  it('erro do provedor aparece e o texto volta para a caixa', async () => {
    connect('minhavida');
    gateway.chat.mockRejectedValue(new Error('Limite de uso atingido.'));
    const { user } = setup();
    const box = screen.getByPlaceholderText(/Peça, pergunte/) as HTMLTextAreaElement;
    await user.type(box, 'tenta{Enter}');
    expect((await screen.findByRole('alert')).textContent).toContain('Limite de uso');
    expect(box.value).toBe('tenta');
  });

  it('trocar de provedor mantém conversas separadas e Nova conversa limpa', async () => {
    connect('minhavida', 'openai');
    gateway.chat.mockResolvedValue({ text: 'só aqui', model: 'm:free', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1 });
    const { user } = setup();
    await user.type(screen.getByPlaceholderText(/Peça, pergunte/), 'oi{Enter}');
    await screen.findByText('só aqui');
    await user.click(screen.getByRole('tab', { name: /Codex/ }));
    expect(screen.queryByText('só aqui')).toBeNull();
    await user.click(screen.getByRole('tab', { name: /Modal minha vida/ }));
    expect(screen.getByText('só aqui')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Nova conversa/ }));
    expect(screen.queryByText('só aqui')).toBeNull();
    expect(get(ai.conversations).minhavida).toEqual([]);
  });

  it('mostra a chave apenas mascarada', () => {
    connect('minhavida');
    setup();
    expect(screen.getByRole('button', { name: /…9f3a/ })).toBeTruthy();
  });

  it('avisa quando o limite diário foi atingido em modelo pago', () => {
    connect('openai');
    ai.selectedProvider.set('openai');
    ai.dailyBudget.set(1);
    ai.requests.set([{ id: '1', time: Date.now(), provider: 'openai', model: 'm', status: 'ok', inputTokens: 1, outputTokens: 1, costUsd: 2, estimated: false, latencyMs: 1 }]);
    setup();
    expect(screen.getByText('limite de hoje atingido')).toBeTruthy();
  });
});
