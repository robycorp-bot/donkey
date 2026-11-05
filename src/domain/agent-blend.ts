import { getProvider } from './providers';
import type { ChatMessage, ChatReply, ProviderId, ProviderStatus } from './models';

/** Roles map to personas/: architect plans, backend/frontend writes, reviewer audits. */
export type BlendRole = 'planner' | 'coder' | 'reviewer';

export interface BlendStep {
  role: BlendRole;
  provider: ProviderId;
  model: string;
}

export interface BlendStepResult extends BlendStep {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
}

export interface BlendResult {
  ok: boolean;
  results: BlendStepResult[];
  totalCostUsd: number;
  totalTokens: number;
  error?: string;
  failedAt?: number;
}

export type ChatFn = (
  provider: ProviderId,
  model: string,
  messages: ChatMessage[],
) => Promise<ChatReply>;

export const ROLE_LABELS: Record<BlendRole, string> = {
  planner: 'Arquiteto',
  coder: 'Desenvolvedor',
  reviewer: 'Revisor',
};

/** Free = runs locally or only uses :free models. Everything else may cost money. */
export function isFree(provider: ProviderId): boolean {
  return provider === 'ollama' || provider === 'minhavida';
}

const ROLE_PROMPTS: Record<BlendRole, string> = {
  planner:
    'Você é o Arquiteto. Quebre a tarefa em um plano curto e objetivo (passos, arquivos, riscos). Não escreva o código final.',
  coder:
    'Você é o Desenvolvedor. Implemente a tarefa seguindo o plano recebido. Entregue o código completo e comentários mínimos.',
  reviewer:
    'Você é o Revisor. Audite o código recebido: bugs, segurança, testes faltando. Liste problemas por gravidade e proponha correções.',
};

// Cheap and local first for the heavy writing; stronger paid models plan and review.
const PREFERENCE: Record<BlendRole, ProviderId[]> = {
  planner: ['anthropic', 'openai', 'google', 'grok', 'openrouter', 'minhavida', 'ollama'],
  coder: ['ollama', 'minhavida', 'google', 'openrouter', 'grok', 'openai', 'anthropic'],
  reviewer: ['anthropic', 'openai', 'google', 'grok', 'openrouter', 'minhavida', 'ollama'],
};

const FREE_PREFERENCE: Record<BlendRole, ProviderId[]> = {
  planner: ['minhavida', 'ollama'],
  coder: ['ollama', 'minhavida'],
  reviewer: ['minhavida', 'ollama'],
};

export function suggestBlend(
  statuses: ProviderStatus[],
  options: { freeOnly?: boolean } = {},
): BlendStep[] {
  const ready = new Set(statuses.filter((s) => s.configured).map((s) => s.id));
  const table = options.freeOnly ? FREE_PREFERENCE : PREFERENCE;
  const steps: BlendStep[] = [];
  for (const role of ['planner', 'coder', 'reviewer'] as const) {
    const provider = table[role].find((id) => ready.has(id) && getProvider(id).supported);
    if (!provider) return [];
    steps.push({ role, provider, model: getProvider(provider).defaultModel });
  }
  return steps;
}

function stepPrompt(role: BlendRole, task: string, previous: BlendStepResult[]): string {
  const context = previous.map((r) => `### Resultado do ${r.role}\n${r.text}`).join('\n\n');
  return `${ROLE_PROMPTS[role]}\n\n## Tarefa\n${task}${context ? `\n\n${context}` : ''}`;
}

const sum = (items: BlendStepResult[], pick: (r: BlendStepResult) => number) =>
  items.reduce((total, item) => total + pick(item), 0);

const totals = (results: BlendStepResult[]) => ({
  results,
  totalCostUsd: sum(results, (r) => r.costUsd ?? 0),
  totalTokens: sum(results, (r) => r.inputTokens + r.outputTokens),
});

const fail = (results: BlendStepResult[], error: string, failedAt?: number): BlendResult => ({
  ok: false,
  ...totals(results),
  error,
  failedAt,
});

/** Runs the steps in order; each one sees the task plus every earlier result. */
export async function runBlend(
  task: string,
  steps: BlendStep[],
  chat: ChatFn,
  options: { freeOnly?: boolean; onProgress?: (done: BlendStepResult[], next: number) => void } = {},
): Promise<BlendResult> {
  if (!task.trim()) return fail([], 'Descreva a tarefa para os agentes.');
  if (!steps.length) return fail([], 'Configure ao menos um provedor para montar o blend.');
  if (options.freeOnly && steps.some((s) => !isFree(s.provider)))
    return fail([], 'Modo só gratuito: há uma etapa com provedor pago.');
  const results: BlendStepResult[] = [];
  for (const [index, step] of steps.entries()) {
    options.onProgress?.([...results], index);
    try {
      const prompt = stepPrompt(step.role, task.trim(), results);
      const reply = await chat(step.provider, step.model, [{ role: 'user', content: prompt }]);
      results.push({
        ...step,
        text: reply.text,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        costUsd: reply.costUsd,
        latencyMs: reply.latencyMs,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return fail(results, `Etapa ${step.role} (${step.provider}) falhou: ${reason}`, index);
    }
  }
  return { ok: true, ...totals(results) };
}
