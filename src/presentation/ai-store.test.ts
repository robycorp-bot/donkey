// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const gateway = vi.hoisted(() => ({
  isPreview: false,
  chat: vi.fn(),
  getProviderStatuses: vi.fn(),
}));
const tools = vi.hoisted(() => ({ catalog: vi.fn() }));
vi.mock('../infrastructure/gateway', () => ({ gateway }));
vi.mock('../infrastructure/workspace-tools', () => ({ tools }));

async function fresh() {
  vi.resetModules();
  return import('./ai-store');
}
async function configured(store: Awaited<ReturnType<typeof fresh>>, ids = ['openai', 'minhavida']) {
  gateway.getProviderStatuses.mockResolvedValue(
    ids.map((id) => ({ id, configured: true, hint: '…1234' })),
  );
  await store.loadStatuses();
}

beforeEach(() => {
  gateway.chat.mockReset();
  gateway.getProviderStatuses.mockReset();
  tools.catalog.mockReset();
  gateway.isPreview = false;
});

describe('ai-store · status e catálogo', () => {
  it('carrega o status mascarado de cada provedor', async () => {
    const store = await fresh();
    await configured(store, ['anthropic']);
    expect(get(store.providerStatus).anthropic).toEqual({ configured: true, hint: '…1234' });
    expect(get(store.providerStatus).openai.configured).toBe(false);
  });

  it('troca para um modelo gratuito válido quando o salvo não existe mais', async () => {
    const store = await fresh();
    tools.catalog.mockResolvedValue([
      { id: 'x/pago', name: 'Pago', company: 'x', free: false, inputPerMillion: 1, outputPerMillion: 2, context: 1 },
      { id: 'meta/livre:free', name: 'Livre', company: 'meta', free: true, inputPerMillion: 0, outputPerMillion: 0, context: 1 },
    ]);
    await store.loadCatalog();
    expect(get(store.catalogState)).toBe('ready');
    expect(get(store.freeModels).map((m) => m.id)).toEqual(['meta/livre:free']);
    expect(get(store.models).minhavida).toBe('meta/livre:free');
    await store.loadCatalog();
    expect(tools.catalog).toHaveBeenCalledTimes(1);
  });

  it('marca o catálogo como indisponível na prévia ou em falha', async () => {
    const store = await fresh();
    tools.catalog.mockRejectedValue(new Error('rede'));
    await store.loadCatalog();
    expect(get(store.catalogState)).toBe('error');
    gateway.isPreview = true;
    await store.loadCatalog(true);
    expect(tools.catalog).toHaveBeenCalledTimes(1);
  });
});

describe('ai-store · envio', () => {
  it('envia só a conversa deste chat e registra custo estimado pelo catálogo', async () => {
    const store = await fresh();
    await configured(store);
    store.catalog.set([
      { id: 'openai/gpt-4.1-mini', name: 'g', company: 'openai', free: false, inputPerMillion: 1, outputPerMillion: 2, context: 1 },
    ]);
    store.selectedProvider.set('openai');
    store.models.update((m) => ({ ...m, openai: 'gpt-4.1-mini' }));
    gateway.chat.mockResolvedValue({
      text: 'resposta',
      model: 'gpt-4.1-mini',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      costUsd: null,
      latencyMs: 900,
    });
    await store.send('  oi  ');
    expect(gateway.chat).toHaveBeenCalledWith('openai', 'gpt-4.1-mini', [{ role: 'user', content: 'oi' }]);
    const [request] = get(store.requests);
    expect(request).toMatchObject({ status: 'ok', costUsd: 3, estimated: true, provider: 'openai' });
    expect(JSON.stringify(request)).not.toContain('oi');
    const messages = get(store.conversations).openai;
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', content: 'resposta' });
    expect(get(store.activity).at(-1)?.kind).toBe('ai');
    expect(get(store.pending).openai).toBe(false);
  });

  it('usa o custo real quando o provedor informa', async () => {
    const store = await fresh();
    await configured(store);
    store.selectedProvider.set('openai');
    gateway.chat.mockResolvedValue({ text: 'ok', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.5, latencyMs: 1 });
    await store.send('oi');
    expect(get(store.requests)[0]).toMatchObject({ costUsd: 0.5, estimated: false });
  });

  it('anexa o arquivo aberto ao conteúdo enviado, mas mostra só o texto digitado', async () => {
    const store = await fresh();
    await configured(store);
    store.selectedProvider.set('openai');
    gateway.chat.mockResolvedValue({ text: 'ok', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1 });
    await store.send('explique', { path: '/p/a.ts', name: 'a.ts', language: 'typescript', content: 'const a = 1;' });
    const sent = gateway.chat.mock.calls[0][2][0].content as string;
    expect(sent).toContain('```typescript\nconst a = 1;\n```');
    expect(sent.endsWith('explique')).toBe(true);
    const user = get(store.conversations).openai[0];
    expect(user).toMatchObject({ display: 'explique', attachment: 'a.ts' });
    expect(get(store.requests)[0].contextFile).toBe('a.ts');
  });

  it('em erro desfaz a mensagem, guarda o erro e registra a falha', async () => {
    const store = await fresh();
    await configured(store);
    store.selectedProvider.set('openai');
    gateway.chat.mockRejectedValue(new Error('cota atingida'));
    await expect(store.send('oi')).rejects.toThrow('cota');
    expect(get(store.conversations).openai).toEqual([]);
    expect(get(store.chatErrors).openai).toBe('cota atingida');
    expect(get(store.requests)[0]).toMatchObject({ status: 'error', error: 'cota atingida' });
  });

  it('não envia sem chave, texto vazio ou com provedor indisponível', async () => {
    const store = await fresh();
    store.selectedProvider.set('openai');
    await store.send('oi');
    await configured(store, ['openai', 'copilot']);
    await store.send('   ');
    store.selectedProvider.set('copilot');
    await store.send('oi');
    expect(gateway.chat).not.toHaveBeenCalled();
  });

  it('o limite diário bloqueia modelos pagos, mas não o Modal minha vida', async () => {
    const store = await fresh();
    await configured(store);
    store.dailyBudget.set(1);
    store.requests.set([
      { id: '1', time: Date.now(), provider: 'openai', model: 'm', status: 'ok', inputTokens: 1, outputTokens: 1, costUsd: 1.2, estimated: false, latencyMs: 1 },
    ]);
    expect(get(store.overBudget)).toBe(true);
    store.selectedProvider.set('openai');
    await store.send('oi');
    expect(gateway.chat).not.toHaveBeenCalled();
    expect(get(store.chatErrors).openai).toContain('Limite');
    gateway.chat.mockResolvedValue({ text: 'ok', model: 'm:free', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1 });
    store.selectedProvider.set('minhavida');
    await store.send('oi');
    expect(gateway.chat).toHaveBeenCalledTimes(1);
    await store.send('de novo', undefined, true);
  });

  it('limpa a conversa e o erro de um provedor', async () => {
    const store = await fresh();
    store.conversations.update((c) => ({ ...c, openai: [{ role: 'user', content: 'x' }] }));
    store.chatErrors.set({ openai: 'falha' });
    store.clearConversation('openai');
    expect(get(store.conversations).openai).toEqual([]);
    expect(get(store.chatErrors).openai).toBe('');
  });
});

describe('ai-store · persistência', () => {
  it('guarda requisições, limite, ações e modelos entre aberturas do app', async () => {
    let store = await fresh();
    store.requests.set([
      { id: '1', time: 1, provider: 'openai', model: 'm', status: 'ok', inputTokens: 1, outputTokens: 1, costUsd: 0, estimated: false, latencyMs: 1 },
    ]);
    store.dailyBudget.set(5);
    store.track('git', 'commit');
    store.models.update((m) => ({ ...m, openai: 'gpt-x' }));
    store = await fresh();
    expect(get(store.requests)).toHaveLength(1);
    expect(get(store.dailyBudget)).toBe(5);
    expect(get(store.activity)[0].message).toBe('commit');
    expect(get(store.models).openai).toBe('gpt-x');
    expect(get(store.models).minhavida).toBeTruthy();
  });

  it('ignora armazenamento corrompido e limita o tamanho do histórico', async () => {
    localStorage.setItem('cmb.requests', '{quebrado');
    let store = await fresh();
    expect(get(store.requests)).toEqual([]);
    for (let i = 0; i < 410; i++) store.track('file', `f${i}`);
    expect(get(store.activity)).toHaveLength(400);
    store = await fresh();
    expect(JSON.parse(localStorage.getItem('cmb.activity')!)).toHaveLength(400);
  });

  it('nunca grava chaves nem texto de conversa no armazenamento', async () => {
    const store = await fresh();
    await configured(store);
    store.selectedProvider.set('openai');
    gateway.chat.mockResolvedValue({ text: 'RESPOSTA-SECRETA', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1 });
    await store.send('PERGUNTA-SECRETA');
    const everything = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('');
    expect(everything).not.toContain('SECRETA');
    expect(everything).not.toContain('…1234');
  });
});
