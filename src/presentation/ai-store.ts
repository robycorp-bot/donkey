import { derived, get, writable, type Writable } from 'svelte/store';
import { gateway } from '../infrastructure/gateway';
import { tools } from '../infrastructure/workspace-tools';
import { PROVIDERS, getProvider } from '../domain/providers';
import type { ChatMessage, ProviderId } from '../domain/models';
import type { CatalogModel } from '../domain/workspace-tools';
import {
  addMember,
  mediateSquad,
  planBlockers,
  removeMember,
  renderSquadPlanMarkdown,
  squadToSteps,
  updateMember,
  type SquadPlan,
  type SquadRole,
} from '../domain/squad-plan';
import { isFree, runBlend, suggestBlend, type BlendResult, type BlendStep, type BlendStepResult } from '../domain/agent-blend';
import { findingLabel, inspectOutbound } from '../application/harness-gate';
import type { SensitiveFinding } from '@donkey/harness';
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
  /** The Harness replaced sensitive excerpts before this left the machine. */
  redacted?: boolean;
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

/* ---------- Harness: nothing reaches a Grau 33 provider without this gate (ADR-006) ---------- */
export interface AuditRequest {
  provider: ProviderId;
  verdict: 'needs_review' | 'blocked';
  message: string;
  findings: SensitiveFinding[];
  /** Exactly what goes out if the human confirms: redacted, never the original. */
  safeText: string;
  /** What the human typed, for the chat bubble. */
  display: string;
  attachment?: string;
  redactedCount: number;
}

/** Pending audit per provider; the send only resumes with an explicit human confirmation. */
export const auditRequests = writable<Partial<Record<ProviderId, AuditRequest>>>({});
export { findingLabel };
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

/**
 * Sends one message. Only the transcript of this chat (plus an explicitly attached file) leaves
 * the app, and only after the Harness clears it. Any verdict other than `safe` opens an audit
 * request instead of calling the provider.
 */
export async function send(text: string, attachment?: Attachment, ignoreBudget = false) {
  const id = get(selectedProvider);
  const provider = getProvider(id);
  const content = text.trim();
  if (!content || get(pending)[id] || !get(providerStatus)[id]?.configured || !provider.supported)
    return;
  if (id !== 'minhavida' && get(overBudget) && !ignoreBudget) {
    chatErrors.update((e) => ({
      ...e,
      [id]: 'Limite de gasto de hoje atingido. Aumente o limite no monitor ou use o Gratuitos (grátis).',
    }));
    return;
  }
  const fullContent = attachment
    ? `Arquivo em contexto: ${attachment.name}\n\`\`\`${attachment.language}\n${attachment.content}\n\`\`\`\n\n${content}`
    : content;

  const decision = inspectOutbound(fullContent, id, 'chat');
  if (!decision.allowed) {
    const findings = decision.outcome?.findings ?? [];
    auditRequests.update((map) => ({
      ...map,
      [id]: {
        provider: id,
        verdict: decision.verdict === 'blocked' ? 'blocked' : 'needs_review',
        message: decision.message,
        findings,
        safeText: decision.textToSend,
        display: content,
        attachment: attachment?.name,
        redactedCount: decision.outcome?.redactedCount ?? 0,
      } satisfies AuditRequest,
    }));
    chatErrors.update((e) => ({ ...e, [id]: '' }));
    track('ai', `Harness barrou o envio ao ${provider.name} · ${findings.length} achado(s)`);
    return;
  }

  clearAudit(id);
  await deliver(id, decision.textToSend, content, attachment?.name, false);
}

function clearAudit(id: ProviderId) {
  auditRequests.update((map) => {
    if (!map[id]) return map;
    const next = { ...map };
    delete next[id];
    return next;
  });
}

/** The human reviewed the findings and released the redacted version. Never the original. */
export async function confirmAudit(id: ProviderId = get(selectedProvider)) {
  const request = get(auditRequests)[id];
  if (!request || get(pending)[id]) return;
  clearAudit(id);
  track(
    'ai',
    `Auditar solicitação: liberada a versão redigida para ${getProvider(id).name} (${request.redactedCount} trecho(s))`,
  );
  await deliver(id, request.safeText, request.display, request.attachment, true);
}

/** Drops the pending send. Nothing left the machine. */
export function cancelAudit(id: ProviderId = get(selectedProvider)) {
  if (!get(auditRequests)[id]) return;
  clearAudit(id);
  track('ai', `Auditar solicitação: envio cancelado pelo humano (${getProvider(id).name})`);
}

async function deliver(
  id: ProviderId,
  contentToSend: string,
  display: string,
  attachmentName: string | undefined,
  redacted: boolean,
) {
  const provider = getProvider(id);
  const model = get(models)[id].trim();
  const user: UiMessage = {
    role: 'user',
    content: contentToSend,
    display,
    attachment: attachmentName,
    redacted,
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
        contextFile: attachmentName,
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

/* ---------- Blend: several agents (and providers) working one task in sequence ---------- */
export const blendFreeOnly = persisted<boolean>('blendFree', true);
export const blendSteps = writable<BlendStep[]>([]);
export const blendRunning = writable(false);
export const blendResult = writable<BlendResult | null>(null);
export const blendTask = writable('');
export const blendProgress = writable<{ done: BlendStepResult[]; next: number } | null>(null);

/** Fills the blend with sensible defaults from the providers that are ready. */
export function autoBlend() {
  blendSteps.set(suggestBlend(Object.entries(get(providerStatus)).map(([id, v]) => ({ id: id as ProviderId, configured: v.configured })), {
    freeOnly: get(blendFreeOnly),
  }));
}

/* ---------- Squad: the mediator proposes, the human edits and approves, then it runs ---------- */
export const squadPlan = writable<SquadPlan | null>(null);
export const squadApproved = writable(false);
export const squadBusy = writable(false);
export const squadPreview = derived(squadPlan, (plan) => (plan ? renderSquadPlanMarkdown(plan) : ''));
export const squadBlockers = derived(squadPlan, (plan) => (plan ? planBlockers(plan) : []));
/** Steps of the run in progress (or the last one), so the UI can label squad members. */
export const runSteps = writable<BlendStep[]>([]);

const readyStatuses = () =>
  Object.entries(get(providerStatus)).map(([id, v]) => ({ id: id as ProviderId, configured: v.configured }));

/** Asks the mediator model for a squad (falls back to keyword rules) and shows it as a preview. */
export async function previewSquad() {
  if (!get(blendTask).trim() || get(squadBusy)) return;
  squadBusy.set(true);
  squadApproved.set(false);
  try {
    squadPlan.set(await mediateSquad(get(blendTask), readyStatuses(), makeChat(), { freeOnly: get(blendFreeOnly) }));
  } finally {
    squadBusy.set(false);
  }
}

function editSquad(change: (plan: SquadPlan) => SquadPlan) {
  squadPlan.update((plan) => (plan ? change(plan) : plan));
  squadApproved.set(false); // any edit needs a fresh approval
}
export const removeSquadMember = (index: number) => editSquad((plan) => removeMember(plan, index));
export const setSquadMember = (index: number, patch: { provider?: ProviderId; model?: string }) =>
  editSquad((plan) => updateMember(plan, index, patch));
export const addSquadMember = (role: SquadRole) => editSquad((plan) => addMember(plan, role, readyStatuses()));

/** Runs the approved squad step by step. Does nothing unless the human approved it. */
export async function runApprovedSquad(): Promise<BlendResult | null> {
  const plan = get(squadPlan);
  if (!plan || !get(squadApproved) || planBlockers(plan).length) return null;
  const steps = squadToSteps(plan);
  runSteps.set(steps);
  return runBlendTask(plan.task, steps);
}

/** Chat function that enforces key/budget rules and records every call in the monitor. */
function makeChat() {
  return async (provider: ProviderId, model: string, messages: ChatMessage[]) => {
    if (!get(providerStatus)[provider]?.configured)
      throw new Error('provedor sem chave configurada');
    if (!isFree(provider) && get(overBudget))
      throw new Error('limite de gasto de hoje atingido');
    // Fail-closed: numa execução automática não há quem audite, então achado interrompe a etapa.
    for (const message of messages) {
      const decision = inspectOutbound(message.content, provider, 'blend');
      if (!decision.allowed) throw new Error(decision.message);
    }
    const started = Date.now();
    try {
      const reply = await gateway.chat(provider, model, messages);
      const cost =
        reply.costUsd ??
        estimateCost(provider, reply.model || model, reply.inputTokens, reply.outputTokens, get(catalog));
      requests.update((list) => [
        ...list,
        {
          id: crypto.randomUUID(),
          time: started,
          provider,
          status: 'ok',
          model: reply.model || model,
          inputTokens: reply.inputTokens,
          outputTokens: reply.outputTokens,
          costUsd: cost,
          estimated: reply.costUsd === null && cost !== null && cost > 0,
          latencyMs: reply.latencyMs,
        },
      ]);
      return { ...reply, costUsd: cost };
    } catch (error) {
      requests.update((list) => [
        ...list,
        {
          id: crypto.randomUUID(),
          time: started,
          provider,
          model,
          status: 'error',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: null,
          estimated: false,
          latencyMs: Date.now() - started,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 200),
        },
      ]);
      throw error;
    }
  };
}

export async function runBlendTask(task: string, steps: BlendStep[] = get(blendSteps)): Promise<BlendResult> {
  blendRunning.set(true);
  blendResult.set(null);
  blendProgress.set(null);
  runSteps.set(steps);
  const freeOnly = get(blendFreeOnly);
  try {
    const result = await runBlend(task, steps, makeChat(), {
      freeOnly,
      onProgress: (done, next) => blendProgress.set({ done, next }),
    });
    blendResult.set(result);
    track('ai', `Blend ${result.ok ? 'concluído' : 'interrompido'} · ${result.results.length} etapa(s)`);
    return result;
  } finally {
    blendRunning.set(false);
    blendProgress.set(null);
  }
}
