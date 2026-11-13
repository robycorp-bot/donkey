/**
 * Executor de CLI local contido (ADR-007, cartão T3b).
 *
 * Este módulo é o contrato da execução delegada: o evento que a linha do tempo consome,
 * a porta nativa (injetada; o adaptador Tauri entra no T3c) e o tradutor por alvo.
 * Nada sobe sem passar antes por `harness-gate.ts`: veredito diferente de `safe` não
 * chega à porta.
 */

import type { ProviderId } from '../domain/models';
import { HARNESS_FAILURE_MESSAGE, inspectOutbound, type OutboundDecision } from './harness-gate';

// ---------------------------------------------------------------------------
// Contrato congelado do evento de execução — v1.
//
// Versionamento:
// - acrescentar um `kind` novo é aditivo e mantém v1: quem consome ignora `kind` desconhecido;
// - renomear ou remover campo, mudar o sentido de um campo ou acrescentar valor em
//   `status`, `code`, `stream`, `billing` ou `target` exige v2.
// O mesmo JSON de exemplo vive no teste Rust (`executor.rs`) e no teste TS.
//
// Sequência de uma execução:
// - exatamente um `finished`, sempre o último;
// - `started` no máximo uma vez, e só se o processo de fato nasceu;
// - recusa antes de nascer: `error` + `finished` com `status: 'refused'`, sem `started`;
// - `output` só entre `started` e `finished`;
// - o texto do pedido e o caminho da raiz nunca vão no evento.
// ---------------------------------------------------------------------------

export const EXECUTION_EVENT_VERSION = 1 as const;

/** Canal único de evento nativo, discriminado por `kind`. */
export const EXECUTION_EVENT_CHANNEL = 'cli-execution';

export const CLI_TARGET_IDS = ['ollama'] as const;
export type CliTargetId = (typeof CLI_TARGET_IDS)[number];

export const EXECUTION_STATUSES = [
  'completed',
  'failed',
  'timed_out',
  'output_limit',
  'cancelled',
  'refused',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const EXECUTION_ERROR_CODES = [
  'gate_blocked',
  'gate_needs_review',
  'target_not_allowed',
  'root_outside_sandbox',
  'invalid_request',
  'cli_missing',
  'spawn_failed',
  'timeout',
  'output_limit',
  'cancelled',
  'exit_nonzero',
] as const;
export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

export const EXECUTION_STREAMS = ['stdout', 'stderr'] as const;
export type ExecutionStream = (typeof EXECUTION_STREAMS)[number];

export const EXECUTION_BILLINGS = ['local', 'subscription'] as const;
export type ExecutionBilling = (typeof EXECUTION_BILLINGS)[number];

interface ExecutionEventBase {
  v: typeof EXECUTION_EVENT_VERSION;
  /** UUID gerado no TS antes do gate. */
  runId: string;
  /** 0, 1, 2… por execução: ordem e detecção de perda. */
  seq: number;
  /** Epoch em milissegundos. */
  at: number;
}

export interface ExecutionStartedEvent extends ExecutionEventBase {
  kind: 'started';
  target: CliTargetId;
  allowedTools: string[];
  billing: ExecutionBilling;
  promptChars: number;
}

export interface ExecutionOutputEvent extends ExecutionEventBase {
  kind: 'output';
  stream: ExecutionStream;
  /** Pedaço de até 8 KiB, com caracteres UTF-8 íntegros. */
  text: string;
}

export interface ExecutionErrorEvent extends ExecutionEventBase {
  kind: 'error';
  code: ExecutionErrorCode;
  /** Mensagem pública em português, sem caminho interno nem stack. */
  message: string;
}

export interface ExecutionFinishedEvent extends ExecutionEventBase {
  kind: 'finished';
  status: ExecutionStatus;
  exitCode: number | null;
  durationMs: number;
  outputBytes: number;
  truncated: boolean;
}

export type ExecutionEvent =
  | ExecutionStartedEvent
  | ExecutionOutputEvent
  | ExecutionErrorEvent
  | ExecutionFinishedEvent;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isRunId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/**
 * Valida um evento vindo da porta nativa. Devolve `null` para versão diferente,
 * `kind` desconhecido ou forma inválida: quem consome descarta, não adivinha.
 */
export function parseExecutionEvent(raw: unknown): ExecutionEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== EXECUTION_EVENT_VERSION || !isRunId(e.runId) || !isCount(e.seq) || !isCount(e.at)) {
    return null;
  }
  const base = { v: EXECUTION_EVENT_VERSION, runId: e.runId, seq: e.seq, at: e.at };
  switch (e.kind) {
    case 'started':
      if (
        !oneOf(CLI_TARGET_IDS, e.target) ||
        !Array.isArray(e.allowedTools) ||
        !e.allowedTools.every((tool) => typeof tool === 'string') ||
        !oneOf(EXECUTION_BILLINGS, e.billing) ||
        !isCount(e.promptChars)
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'started',
        target: e.target,
        allowedTools: [...(e.allowedTools as string[])],
        billing: e.billing,
        promptChars: e.promptChars,
      };
    case 'output':
      if (!oneOf(EXECUTION_STREAMS, e.stream) || typeof e.text !== 'string') return null;
      return { ...base, kind: 'output', stream: e.stream, text: e.text };
    case 'error':
      if (!oneOf(EXECUTION_ERROR_CODES, e.code) || typeof e.message !== 'string') return null;
      return { ...base, kind: 'error', code: e.code, message: e.message };
    case 'finished':
      if (
        !oneOf(EXECUTION_STATUSES, e.status) ||
        !(e.exitCode === null || (typeof e.exitCode === 'number' && Number.isInteger(e.exitCode))) ||
        !isCount(e.durationMs) ||
        !isCount(e.outputBytes) ||
        typeof e.truncated !== 'boolean'
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'finished',
        status: e.status,
        exitCode: e.exitCode,
        durationMs: e.durationMs,
        outputBytes: e.outputBytes,
        truncated: e.truncated,
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Porta nativa. O adaptador Tauri (invoke + listen no canal) entra no T3c.
// ---------------------------------------------------------------------------

export interface CliExecutionRequest {
  runId: string;
  target: CliTargetId;
  model: string;
  /** Texto já liberado pelo gate. Vai ao processo pela entrada padrão. */
  prompt: string;
  timeoutMs?: number;
}

export interface CliExecutorPort {
  /** Sobe o processo e entrega cada evento bruto do canal nativo; resolve depois do `finished`. */
  start(request: CliExecutionRequest, onEvent: (raw: unknown) => void): Promise<void>;
  cancel(runId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tradutor por alvo: quando entrar um CLI com formato próprio de saída, só ele muda.
// ---------------------------------------------------------------------------

export type ExecutionTranslator = (event: ExecutionEvent) => ExecutionEvent;

const ANSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

/** Ollama fala texto puro; só tiramos sequência de terminal e retorno de carro solto. */
export function translateOllama(event: ExecutionEvent): ExecutionEvent {
  if (event.kind !== 'output') return event;
  return { ...event, text: event.text.replace(ANSI_SEQUENCE, '').replace(/\r(?!\n)/g, '') };
}

interface CliTargetDefinition {
  /** Provedor usado pelo `harness-gate` para decidir se o destino é Grau 33. */
  provider: ProviderId;
  translate: ExecutionTranslator;
}

const CLI_TARGETS: Record<CliTargetId, CliTargetDefinition> = {
  ollama: { provider: 'ollama', translate: translateOllama },
};

export function isCliTarget(value: unknown): value is CliTargetId {
  return oneOf(CLI_TARGET_IDS, value);
}

// ---------------------------------------------------------------------------
// Executor: gate → porta → tradutor.
// ---------------------------------------------------------------------------

/** Mesmo teto do lado nativo (`executor.rs`). */
export const MAX_PROMPT_BYTES = 64 * 1024;
const MODEL = /^(?!-)[A-Za-z0-9._:/-]{1,128}$/;

export const CLI_MESSAGES = {
  targetNotAllowed: 'Este CLI não está na lista permitida do Donkey.',
  invalidRequest: 'Pedido de execução inválido.',
  gateRefused:
    'O Harness não liberou este pedido. Revise em "auditar solicitação" antes de executar.',
  spawnFailed: 'Não foi possível iniciar o CLI.',
  noFinish: 'A execução terminou sem a confirmação do processo.',
} as const;

export type OutboundGate = (text: string, provider: ProviderId) => OutboundDecision;

export interface CliExecutorDeps {
  port: CliExecutorPort;
  gate?: OutboundGate;
  newRunId?: () => string;
  now?: () => number;
}

export interface CliRunOptions {
  target: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
  onEvent: (event: ExecutionEvent) => void;
}

export interface CliRunResult {
  runId: string;
  /** Nulo quando o pedido foi recusado antes do gate. */
  decision: OutboundDecision | null;
  finished: ExecutionFinishedEvent;
}

function validRequest(model: string, prompt: string): boolean {
  return (
    MODEL.test(model) &&
    !model.split('/').includes('..') &&
    prompt.trim() !== '' &&
    !prompt.includes('\0') &&
    new TextEncoder().encode(prompt).length <= MAX_PROMPT_BYTES
  );
}

export function createCliExecutor(deps: CliExecutorDeps) {
  const gate = deps.gate ?? inspectOutbound;
  const newRunId = deps.newRunId ?? (() => globalThis.crypto.randomUUID());
  const now = deps.now ?? Date.now;

  async function run(options: CliRunOptions): Promise<CliRunResult> {
    const runId = newRunId();
    let seq = 0;
    let finished: ExecutionFinishedEvent | null = null;
    const startedAt = now();

    // Lido por função: o fim chega dentro do callback da porta, fora do fluxo que o TS acompanha.
    const closed = (): ExecutionFinishedEvent | null => finished;
    const deliver = (event: ExecutionEvent) => {
      if (finished) return;
      seq = event.seq + 1;
      if (event.kind === 'finished') finished = event;
      options.onEvent(event);
    };
    const end = (
      status: ExecutionStatus,
      code: ExecutionErrorCode,
      message: string,
    ): ExecutionFinishedEvent => {
      const base = { v: EXECUTION_EVENT_VERSION, runId };
      deliver({ ...base, seq, at: now(), kind: 'error', code, message });
      const last: ExecutionFinishedEvent = {
        ...base,
        seq,
        at: now(),
        kind: 'finished',
        status,
        exitCode: null,
        durationMs: Math.max(0, now() - startedAt),
        outputBytes: 0,
        truncated: false,
      };
      deliver(last);
      return last;
    };

    if (!isCliTarget(options.target)) {
      return {
        runId,
        decision: null,
        finished: end('refused', 'target_not_allowed', CLI_MESSAGES.targetNotAllowed),
      };
    }
    const target = CLI_TARGETS[options.target];
    if (!validRequest(options.model, options.prompt)) {
      return {
        runId,
        decision: null,
        finished: end('refused', 'invalid_request', CLI_MESSAGES.invalidRequest),
      };
    }

    let decision: OutboundDecision;
    try {
      decision = gate(options.prompt, target.provider);
    } catch {
      // Gate quebrado barra: fail-closed, igual ao harness-gate.
      return {
        runId,
        decision: null,
        finished: end('refused', 'gate_blocked', HARNESS_FAILURE_MESSAGE),
      };
    }
    if (!decision.allowed || decision.verdict !== 'safe') {
      const code = decision.verdict === 'needs_review' ? 'gate_needs_review' : 'gate_blocked';
      return {
        runId,
        decision,
        finished: end('refused', code, decision.message || CLI_MESSAGES.gateRefused),
      };
    }

    const request: CliExecutionRequest = {
      runId,
      target: options.target,
      model: options.model,
      prompt: decision.textToSend,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    };
    try {
      await deps.port.start(request, (raw) => {
        const event = parseExecutionEvent(raw);
        if (event && event.runId === runId) deliver(target.translate(event));
      });
    } catch {
      // A falha da porta nunca chega ao usuário como texto cru: pode carregar caminho interno.
      const done = closed();
      return {
        runId,
        decision,
        finished: done ?? end('failed', 'spawn_failed', CLI_MESSAGES.spawnFailed),
      };
    }
    return {
      runId,
      decision,
      finished: closed() ?? end('failed', 'spawn_failed', CLI_MESSAGES.noFinish),
    };
  }

  async function cancel(runId: string): Promise<void> {
    if (isRunId(runId)) await deps.port.cancel(runId);
  }

  return { run, cancel };
}
