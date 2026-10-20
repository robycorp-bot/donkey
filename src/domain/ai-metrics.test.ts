import { describe, expect, it } from 'vitest';
import {
  byModel,
  dailyCost,
  estimateCost,
  findPricing,
  formatUsd,
  segments,
  totals,
  type AiRequest,
} from './ai-metrics';
import type { CatalogModel } from './workspace-tools';

const catalog: CatalogModel[] = [
  { id: 'openai/gpt-4.1-mini', name: 'GPT', company: 'openai', free: false, inputPerMillion: 0.4, outputPerMillion: 1.6, context: 1 },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Sonnet', company: 'anthropic', free: false, inputPerMillion: 3, outputPerMillion: 15, context: 1 },
];
const request = (over: Partial<AiRequest>): AiRequest => ({
  id: 'x', time: Date.now(), provider: 'openai', model: 'gpt-4.1-mini', status: 'ok',
  inputTokens: 0, outputTokens: 0, costUsd: 0, estimated: false, latencyMs: 100, ...over,
});

describe('ai metrics', () => {
  it('maps direct API model ids to catalogue prices', () => {
    expect(findPricing('anthropic', 'claude-sonnet-4-5-20250929', catalog)?.id).toBe(
      'anthropic/claude-sonnet-4.5',
    );
    expect(estimateCost('openai', 'gpt-4.1-mini', 1_000_000, 500_000, catalog)).toBeCloseTo(1.2);
    expect(estimateCost('openai', 'desconhecido', 10, 10, catalog)).toBeNull();
    expect(estimateCost('minhavida', 'qualquer:free', 10, 10, catalog)).toBe(0);
  });
  it('aggregates totals, per model and per day', () => {
    const list = [
      request({ costUsd: 0.5, inputTokens: 10, outputTokens: 5 }),
      request({ costUsd: null, model: 'outro' }),
      request({ status: 'error', costUsd: null }),
    ];
    const t = totals(list);
    expect([t.requests, t.errors, t.costUsd, t.unknownCost]).toEqual([3, 1, 0.5, 1]);
    expect(byModel(list)[0].model).toBe('gpt-4.1-mini');
    expect(dailyCost(list).at(-1)).toBe(0.5);
    expect(formatUsd(0, false, true)).toBe('grátis');
    expect(formatUsd(0)).toBe('US$ 0.00');
    expect(formatUsd(0.0012, true)).toBe('~US$ 0.0012');
  });
  it('splits code fences without interpreting HTML', () => {
    const parts = segments('Veja:\n```ts\nconst a = 1;\n```\n<b>fim</b>');
    expect(parts.map((p) => p.kind)).toEqual(['text', 'code', 'text']);
    expect(parts[1]).toEqual({ kind: 'code', lang: 'ts', code: 'const a = 1;' });
  });
});
