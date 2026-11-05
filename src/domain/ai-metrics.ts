import type { ProviderId } from './models';
import type { CatalogModel } from './workspace-tools';

/** One AI call. Metadata only: prompts, answers and keys are never stored here. */
export interface AiRequest {
  id: string;
  time: number;
  provider: ProviderId;
  model: string;
  status: 'ok' | 'error';
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  estimated: boolean;
  latencyMs: number;
  contextFile?: string;
  error?: string;
}

const PREFIX: Partial<Record<ProviderId, string>> = { openai: 'openai/', anthropic: 'anthropic/' };

/** Finds catalogue pricing for a direct OpenAI/Anthropic model id (e.g. claude-sonnet-4-5). */
export function findPricing(
  provider: ProviderId,
  model: string,
  catalog: CatalogModel[],
): CatalogModel | undefined {
  const ids = new Map(catalog.map((item) => [item.id, item]));
  const prefix = PREFIX[provider] ?? '';
  const base = model.replace(/-\d{8}$/, '');
  const candidates = [
    model,
    `${prefix}${model}`,
    `${prefix}${base}`,
    `${prefix}${base.replace(/-(\d+)-(\d+)(?=$|-)/, '-$1.$2')}`,
  ];
  for (const id of candidates) {
    const hit = ids.get(id);
    if (hit) return hit;
  }
  return undefined;
}

export function estimateCost(
  provider: ProviderId,
  model: string,
  inputTokens: number,
  outputTokens: number,
  catalog: CatalogModel[],
): number | null {
  if (provider === 'minhavida') return 0;
  const pricing = findPricing(provider, model, catalog);
  if (!pricing) return null;
  return (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1e6;
}

export interface Totals {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  unknownCost: number;
  avgLatencyMs: number;
}

export function totals(requests: AiRequest[]): Totals {
  const ok = requests.filter((r) => r.status === 'ok');
  return {
    requests: requests.length,
    errors: requests.length - ok.length,
    inputTokens: ok.reduce((sum, r) => sum + r.inputTokens, 0),
    outputTokens: ok.reduce((sum, r) => sum + r.outputTokens, 0),
    costUsd: ok.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    unknownCost: ok.filter((r) => r.costUsd === null).length,
    avgLatencyMs: ok.length ? Math.round(ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length) : 0,
  };
}

export function startOfDay(now = Date.now()): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function byModel(
  requests: AiRequest[],
): { key: string; provider: ProviderId; model: string; totals: Totals }[] {
  const groups = new Map<string, AiRequest[]>();
  for (const r of requests) {
    const key = `${r.provider}|${r.model}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      provider: list[0].provider,
      model: list[0].model,
      totals: totals(list),
    }))
    .sort((a, b) => b.totals.costUsd - a.totals.costUsd || b.totals.requests - a.totals.requests);
}

/** Last N days, oldest first, for the spend sparkline. */
export function dailyCost(requests: AiRequest[], days = 14, now = Date.now()): number[] {
  const today = startOfDay(now);
  const result = Array.from({ length: days }, () => 0);
  for (const r of requests) {
    if (r.status !== 'ok' || !r.costUsd) continue;
    const index = days - 1 - Math.round((today - startOfDay(r.time)) / 86_400_000);
    if (index >= 0 && index < days) result[index] += r.costUsd;
  }
  return result;
}

export function formatUsd(value: number | null, estimated = false, free = false): string {
  if (value === null) return '—';
  if (value === 0) return free ? 'grátis' : 'US$ 0.00';
  const text =
    value < 0.01 ? `US$ ${value.toFixed(4)}` : value < 1 ? `US$ ${value.toFixed(3)}` : `US$ ${value.toFixed(2)}`;
  return estimated ? `~${text}` : text;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

/** Splits an answer into prose and fenced code blocks. Rendered as text, never as HTML. */
export type Segment = { kind: 'text'; text: string } | { kind: 'code'; lang: string; code: string };
export function segments(content: string): Segment[] {
  const parts: Segment[] = [];
  const fence = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (const match of content.matchAll(fence)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: 'text', text: content.slice(last, index) });
    parts.push({ kind: 'code', lang: match[1] || 'texto', code: match[2].replace(/\n$/, '') });
    last = index + match[0].length;
  }
  if (last < content.length) parts.push({ kind: 'text', text: content.slice(last) });
  return parts.filter((p) => (p.kind === 'text' ? p.text.trim() : true));
}

/** Rough token estimate (~4 chars per token) to preview context size before sending. */
export function roughTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
