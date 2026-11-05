import { derived, get, writable, type Writable } from 'svelte/store';
import { gateway } from '../infrastructure/gateway';
import { tools } from '../infrastructure/workspace-tools';
import { PROVIDERS, getProvider } from '../domain/providers';
import type { ChatMessage, ProviderId } from '../domain/models';
import type { CatalogModel } from '../domain/workspace-tools';
import {
  estimateCost,
  startOfDay,
  totals,
  type AiRequest,
} from '../domain/ai-metrics';

/* ---------- small persisted stores (metadata only, never keys or prompts) ---------- */
function persisted<T>(key: string, fallback: T, limit?: (value: T) => T): Writable<T> {
  let initial = fallback;
  try {
    const raw = localStorage.getItem(`cmb.${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      const isRecord = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
      // Records merge with defaults so new providers get their default model.
      initial = isRecord(fallback) && isRecord(parsed) ? { ...fallback, ...parsed } : parsed;
    }
  } catch {
    initial = fallback;
  }
  const store = writable<T>(initial);
  store.subscribe((value) => {
    try {
      localStorage.setItem(`cmb.${key}`, JSON.stringify(limit ? limit(value) : value));
    } catch {
      /* storage unavailable or full */
    }
  });
  return store;
}

export interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  /** What the user typed, when a file was attached as context. */
  display?: string;
  attachment?: string;
  meta?: Pick<
    AiRequest,
    'model' | 'inputTokens' | 'outputTokens' | 'costUsd' | 'estimated' | 'latencyMs'
  >;
}

export type ActivityKind = 'ai' | 'file' | 'git' | 'terminal' | 'run' | 'system';
export interface Activity {
  time: number;
  kind: ActivityKind;
  message: string;
}

const emptyByProvider = <T>(value: () => T) =>
  Object.fromEntries(PROVIDERS.map((p) => [p.id, value()])) as Record<ProviderId, T>;

export const selectedProvider = persisted<ProviderId>('provider', 'minhavida');
export const models = persisted<Record<ProviderId, string>>(
  'models',
  Object.fromEntries(PROVIDERS.map((p) => [p.id, p.defaultModel])) as Record<ProviderId, string>,
);
export const providerStatus = writable<Record<ProviderId, { configured: boolean; hint?: string | null }>>(
  emptyByProvider(() => ({ configured: false })),
);
export const conversations = writable<Record<ProviderId, UiMessage[]>>(emptyByProvider(() => []));
export const pending = writable<Partial<Record<ProviderId, boolean>>>({});
export const chatErrors = writable<Partial<Record<ProviderId, string>>>({});
export const requests = persisted<AiRequest[]>('requests', [], (list) => list.slice(-3000));
export const activity = persisted<Activity[]>('activity', [], (list) => list.slice(-400));
export const dailyBudget = persisted<number>('budget', 0);

export const catalog = writable<CatalogModel[]>([]);
export const catalogState = writable<'idle' | 'loading' | 'ready' | 'error'>('idle');
export const freeModels = derived(catalog, ($c) => $c.filter((m) => m.free));

export const todayTotals = derived(requests, ($r) => totals($r.filter((r) => r.time >= startOfDay())));
export const overBudget = derived([todayTotals, dailyBudget], ([$t, $b]) => $b > 0 && $t.costUsd >= $b);

export function track(kind: ActivityKind, message: string) {
  activity.update((list) => [...list.slice(-399), { time: Date.now(), kind, message }]);
}

export async function loadStatuses() {
  const statuses = await gateway.getProviderStatuses();
  providerStatus.set(
    Object.fromEntries(
      PROVIDERS.map((p) => {
        const found = statuses.find((s) => s.id === p.id);
        return [p.id, { configured: !!found?.configured, hint: found?.hint ?? null }];
      }),
    ) as Record<ProviderId, { configured: boolean; hint?: string | null }>,
  );
}

export async function loadCatalog(force = false) {
  const state = get(catalogState);
  if (!force && (state === 'loading' || state === 'ready')) return;
  if (gateway.isPreview) {
    catalogState.set('error');
    return;
  }
  catalogState.set('loading');
  try {
    const list = await tools.catalog();
    catalog.set(list);
    catalogState.set('ready');
    const free = list.filter((m) => m.free);
    const current = get(models).minhavida;
    if (free.length && !free.some((m) => m.id === current))
      models.update((m) => ({ ...m, minhavida: free[0].id }));
  } catch {
    catalogState.set('error');
  }
}

export interface Attachment {
  path: string;
  name: string;
  language: string;
  content: string;
}

/** Sends one message. Only the transcript of this chat (plus an explicitly attached file) leaves the app. */
export async function send(text: string, attachment?: Attachment, ignoreBudget = false) {
  const id = get(selectedProvider);
  const provider = getProvider(id);
  const content = text.trim();
  if (!content || get(pending)[id] || !get(providerStatus)[id]?.configured || !provider.supported)
    return;
  if (id !== 'minhavida' && get(overBudget) && !ignoreBudget) {
    chatErrors.update((e) => ({
      ...e,
      [id]: 'Limite de gasto de hoje atingido. Aumente o limite no monitor ou use o Modal minha vida (grátis).',
    }));
    return;
  }
  const model = get(models)[id].trim();
  const fullContent = attachment
    ? `Arquivo em contexto: ${attachment.name}\n\`\`\`${attachment.language}\n${attachment.content}\n\`\`\`\n\n${content}`
    : content;
  const user: UiMessage = {
    role: 'user',
    content: fullContent,
    display: content,
    attachment: attachment?.name,
  };
  const history = [...get(conversations)[id], user];
  conversations.update((c) => ({ ...c, [id]: history }));
  pending.update((p) => ({ ...p, [id]: true }));
  chatErrors.update((e) => ({ ...e, [id]: '' }));
  const started = Date.now();
  const transcript: ChatMessage[] = history.map(({ role, content }) => ({ role, content }));
  try {
    const reply = await gateway.chat(id, model, transcript);
    const estimated = reply.costUsd === null;
    const cost =
      reply.costUsd ??
      estimateCost(id, reply.model || model, reply.inputTokens, reply.outputTokens, get(catalog));
    const meta = {
      model: reply.model || model,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      costUsd: cost,
      estimated: estimated && cost !== null && cost > 0,
      latencyMs: reply.latencyMs,
    };
    conversations.update((c) => ({
      ...c,
      [id]: [...history, { role: 'assistant', content: reply.text, meta }],
    }));
    requests.update((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        time: started,
        provider: id,
        status: 'ok',
        contextFile: attachment?.name,
        ...meta,
      },
    ]);
    track('ai', `${provider.name} · ${meta.model} respondeu (${meta.outputTokens} tokens)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    conversations.update((c) => ({ ...c, [id]: history.slice(0, -1) }));
    chatErrors.update((e) => ({ ...e, [id]: message }));
    requests.update((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        time: started,
        provider: id,
        model,
        status: 'error',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: null,
        estimated: false,
        latencyMs: Date.now() - started,
        error: message.slice(0, 200),
      },
    ]);
    track('ai', `${provider.name} · falha: ${message.slice(0, 80)}`);
    throw error;
  } finally {
    pending.update((p) => ({ ...p, [id]: false }));
  }
}

export function clearConversation(id: ProviderId) {
  conversations.update((c) => ({ ...c, [id]: [] }));
  chatErrors.update((e) => ({ ...e, [id]: '' }));
}
