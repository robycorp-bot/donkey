import { describe, expect, it, vi } from 'vitest';
import { isFree, runBlend, suggestBlend, type BlendStep } from './agent-blend';
import type { ChatReply, ProviderStatus } from './models';

const ready = (...ids: string[]) => ids.map((id) => ({ id, configured: true })) as ProviderStatus[];
const reply = (text: string, costUsd: number | null = 0): ChatReply => ({
  text,
  model: 'm',
  inputTokens: 10,
  outputTokens: 5,
  costUsd,
  latencyMs: 7,
});

describe('suggestBlend', () => {
  it('usa o local para escrever e o pago forte para planejar e revisar', () => {
    const blend = suggestBlend(ready('anthropic', 'minhavida', 'ollama'));
    expect(blend.map((s) => s.role)).toEqual(['planner', 'coder', 'reviewer']);
    expect(blend[0].provider).toBe('anthropic');
    expect(blend[1].provider).toBe('ollama');
    expect(blend[2].provider).toBe('anthropic');
  });
  it('modo só gratuito nunca escolhe provedor pago', () => {
    const blend = suggestBlend(ready('anthropic', 'openai', 'minhavida'), { freeOnly: true });
    expect(blend).toHaveLength(3);
    expect(blend.every((s) => isFree(s.provider))).toBe(true);
  });
  it('sem provedor utilizável devolve lista vazia', () => {
    expect(suggestBlend([])).toEqual([]);
    expect(suggestBlend(ready('anthropic'), { freeOnly: true })).toEqual([]);
  });
});

describe('runBlend', () => {
  const steps: BlendStep[] = [
    { role: 'planner', provider: 'minhavida', model: 'a:free' },
    { role: 'coder', provider: 'ollama', model: 'b' },
  ];
  it('encadeia: cada etapa recebe a tarefa e o resultado das anteriores', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(reply('PLANO'))
      .mockResolvedValueOnce(reply('CODIGO', 0.01));
    const result = await runBlend('criar login', steps, chat);
    expect(result.ok).toBe(true);
    expect(result.results.map((r) => r.text)).toEqual(['PLANO', 'CODIGO']);
    const second = chat.mock.calls[1][2][0].content as string;
    expect(second).toContain('criar login');
    expect(second).toContain('PLANO');
    expect(result.totalCostUsd).toBeCloseTo(0.01);
    expect(result.totalTokens).toBe(30);
  });
  it('interrompe na falha e preserva o que já foi gerado', async () => {
    const chat = vi.fn().mockResolvedValueOnce(reply('PLANO')).mockRejectedValueOnce(new Error('sem cota'));
    const result = await runBlend('x', steps, chat);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('sem cota');
    expect(result.results).toHaveLength(1);
    expect(result.failedAt).toBe(1);
  });
  it('freeOnly bloqueia etapa paga antes de qualquer chamada', async () => {
    const chat = vi.fn();
    const paid: BlendStep[] = [{ role: 'coder', provider: 'anthropic', model: 'c' }];
    const result = await runBlend('x', paid, chat, { freeOnly: true });
    expect(result.ok).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });
  it('avisa o progresso antes de cada etapa', async () => {
    const chat = vi.fn().mockResolvedValue(reply('x'));
    const seen: [number, number][] = [];
    await runBlend('t', steps, chat, { onProgress: (done, next) => seen.push([done.length, next]) });
    expect(seen).toEqual([[0, 0], [1, 1]]);
  });
  it('rejeita tarefa vazia ou blend vazio', async () => {
    const chat = vi.fn();
    expect((await runBlend('  ', steps, chat)).ok).toBe(false);
    expect((await runBlend('x', [], chat)).ok).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });
});
