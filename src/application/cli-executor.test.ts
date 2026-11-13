import { describe, expect, it, vi } from 'vitest';
import {
  CLI_MESSAGES,
  EXECUTION_EVENT_CHANNEL,
  EXECUTION_EVENT_VERSION,
  MAX_PROMPT_BYTES,
  createCliExecutor,
  parseExecutionEvent,
  translateOllama,
  type CliExecutionRequest,
  type CliExecutorPort,
  type ExecutionEvent,
  type OutboundGate,
} from './cli-executor';
import { HARNESS_FAILURE_MESSAGE, type OutboundDecision } from './harness-gate';

/** Mesmo JSON do teste de contrato em `src-tauri/src/infrastructure/executor.rs`. */
const CONTRACT_SAMPLE = `[
  {"v":1,"runId":"0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6","seq":0,"at":1763060000000,"kind":"started","target":"ollama","allowedTools":[],"billing":"local","promptChars":12},
  {"v":1,"runId":"0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6","seq":1,"at":1763060000100,"kind":"output","stream":"stdout","text":"olá"},
  {"v":1,"runId":"0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6","seq":2,"at":1763060000200,"kind":"error","code":"exit_nonzero","message":"O CLI terminou com erro."},
  {"v":1,"runId":"0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6","seq":3,"at":1763060000250,"kind":"finished","status":"failed","exitCode":3,"durationMs":250,"outputBytes":4,"truncated":false}
]`;

const sample = (): Record<string, unknown>[] => JSON.parse(CONTRACT_SAMPLE);

describe('cli-executor · contrato do evento v1', () => {
  it('fixa versão e canal', () => {
    expect(EXECUTION_EVENT_VERSION).toBe(1);
    expect(EXECUTION_EVENT_CHANNEL).toBe('cli-execution');
  });

  it('aceita a amostra do contrato sem perder nem acrescentar campo', () => {
    const raw = sample();
    const parsed = raw.map(parseExecutionEvent);
    expect(parsed.every((event) => event !== null)).toBe(true);
    expect(parsed).toEqual(raw);
    expect(parsed.map((event) => (event as ExecutionEvent).kind)).toEqual([
      'started',
      'output',
      'error',
      'finished',
    ]);
  });

  it('descarta kind desconhecido (aditivo) e versão diferente', () => {
    const [started] = sample();
    expect(parseExecutionEvent({ ...started, kind: 'step' })).toBeNull();
    expect(parseExecutionEvent({ ...started, v: 2 })).toBeNull();
  });

  it('descarta forma inválida em vez de adivinhar', () => {
    const [started, output, error, finished] = sample();
    for (const bad of [
      null,
      'texto',
      { ...started, runId: '../fora' },
      { ...started, seq: -1 },
      { ...started, at: 1.5 },
      { ...started, target: 'claude' },
      { ...started, allowedTools: [1] },
      { ...started, billing: 'gratis' },
      { ...output, stream: 'stdin' },
      { ...output, text: 42 },
      { ...error, code: 'qualquer' },
      { ...error, message: undefined },
      { ...finished, status: 'ok' },
      { ...finished, exitCode: '3' },
      { ...finished, truncated: 'não' },
    ]) {
      expect(parseExecutionEvent(bad)).toBeNull();
    }
  });

  it('aceita exitCode nulo no fim (processo morto ou que nem nasceu)', () => {
    const finished = sample()[3];
    expect(parseExecutionEvent({ ...finished, exitCode: null, status: 'timed_out' })).not.toBeNull();
  });
});

const RUN_ID = '11111111-2222-4333-8444-555555555555';

function decision(verdict: OutboundDecision['verdict'], textToSend = 'pedido'): OutboundDecision {
  return {
    grau33: verdict !== 'safe',
    verdict,
    outcome: null,
    allowed: verdict === 'safe',
    textToSend,
    redacted: verdict !== 'safe',
    message: verdict === 'safe' ? '' : 'Achado sensível.',
  };
}

/** Porta falsa: registra o pedido e devolve, na ordem, os eventos brutos roteirizados. */
function fakePort(script: (request: CliExecutionRequest) => unknown[] = scriptOk) {
  const calls: CliExecutionRequest[] = [];
  const port: CliExecutorPort & { calls: CliExecutionRequest[] } = {
    calls,
    start: vi.fn<CliExecutorPort['start']>(async (request, onEvent) => {
      calls.push(request);
      for (const raw of script(request)) onEvent(raw);
    }),
    cancel: vi.fn<CliExecutorPort['cancel']>(async () => {}),
  };
  return port;
}

function scriptOk(request: CliExecutionRequest): unknown[] {
  const base = { v: 1, runId: request.runId, at: 1 };
  return [
    {
      ...base,
      seq: 0,
      kind: 'started',
      target: 'ollama',
      allowedTools: [],
      billing: 'local',
      promptChars: request.prompt.length,
    },
    { ...base, seq: 1, kind: 'output', stream: 'stdout', text: '\x1b[32mpronto\x1b[0m\r' },
    {
      ...base,
      seq: 2,
      kind: 'finished',
      status: 'completed',
      exitCode: 0,
      durationMs: 5,
      outputBytes: 6,
      truncated: false,
    },
  ];
}

function setup(gate?: OutboundGate, port = fakePort()) {
  const events: ExecutionEvent[] = [];
  const executor = createCliExecutor({ port, gate, newRunId: () => RUN_ID, now: () => 1000 });
  const run = (overrides: Partial<{ target: string; model: string; prompt: string }> = {}) =>
    executor.run({
      target: 'ollama',
      model: 'llama3.2',
      prompt: 'Explique este parser.',
      onEvent: (event) => events.push(event),
      ...overrides,
    });
  return { executor, port, events, run };
}

describe('cli-executor · gate antes do processo', () => {
  it('com veredito safe, sobe pela porta e repassa os eventos traduzidos em ordem', async () => {
    const gate = vi.fn<OutboundGate>(() => decision('safe', 'Explique este parser.'));
    const { port, events, run } = setup(gate);
    const result = await run();
    expect(gate).toHaveBeenCalledWith('Explique este parser.', 'ollama');
    expect(port.calls).toEqual([
      { runId: RUN_ID, target: 'ollama', model: 'llama3.2', prompt: 'Explique este parser.' },
    ]);
    expect(events.map((e) => e.kind)).toEqual(['started', 'output', 'finished']);
    expect(events[1]).toMatchObject({ kind: 'output', text: 'pronto' });
    expect(result.finished).toMatchObject({ status: 'completed', exitCode: 0 });
    expect(result.runId).toBe(RUN_ID);
  });

  it.each([
    ['blocked', 'gate_blocked'],
    ['needs_review', 'gate_needs_review'],
  ] as const)('veredito %s impede o processo de nascer', async (verdict, code) => {
    const { port, events, run } = setup(() => decision(verdict, '[REDACTED:cpf]'));
    const result = await run({ prompt: 'CPF 123.456.789-09' });
    expect(port.start).not.toHaveBeenCalled();
    expect(events.map((e) => e.kind)).toEqual(['error', 'finished']);
    expect(events[0]).toMatchObject({ kind: 'error', code, message: 'Achado sensível.', seq: 0 });
    expect(events[1]).toMatchObject({ status: 'refused', seq: 1, exitCode: null, runId: RUN_ID });
    expect(result.decision?.verdict).toBe(verdict);
    expect(events.every((e) => parseExecutionEvent(e) !== null)).toBe(true);
  });

  it('veredito safe sem liberação também barra (fail-closed)', async () => {
    const { port, events, run } = setup(() => ({ ...decision('safe'), allowed: false }));
    await run();
    expect(port.start).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ code: 'gate_blocked', message: CLI_MESSAGES.gateRefused });
  });

  it('gate que quebra barra em vez de liberar', async () => {
    const { port, events, run } = setup(() => {
      throw new Error('detector quebrado');
    });
    const result = await run();
    expect(port.start).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ code: 'gate_blocked', message: HARNESS_FAILURE_MESSAGE });
    expect(result.finished.status).toBe('refused');
  });

  it('sem gate injetado usa o harness-gate real (Ollama local segue sem auditoria)', async () => {
    const { port, run } = setup();
    const result = await run();
    expect(port.start).toHaveBeenCalledOnce();
    expect(result.decision).toMatchObject({ grau33: false, verdict: 'safe' });
  });
});

describe('cli-executor · recusas antes do gate', () => {
  it.each(['claude', 'powershell', '../ollama', 'C:\\Windows\\System32\\cmd.exe', ''])(
    'CLI fora da lista (%s) é recusado sem chamar gate nem porta',
    async (target) => {
      const gate = vi.fn<OutboundGate>(() => decision('safe'));
      const { port, events, run } = setup(gate);
      const result = await run({ target });
      expect(gate).not.toHaveBeenCalled();
      expect(port.start).not.toHaveBeenCalled();
      expect(events[0]).toMatchObject({ code: 'target_not_allowed' });
      expect(result).toMatchObject({ decision: null, finished: { status: 'refused' } });
    },
  );

  it.each([
    ['', 'oi'],
    ['--verbose', 'oi'],
    ['llama 3', 'oi'],
    ['a/../b', 'oi'],
    ['llama3.2', '   '],
    ['llama3.2', 'a\0b'],
    ['llama3.2', 'a'.repeat(MAX_PROMPT_BYTES + 1)],
  ])('pedido inválido (modelo %j) é recusado', async (model, prompt) => {
    const gate = vi.fn<OutboundGate>(() => decision('safe'));
    const { port, events, run } = setup(gate);
    await run({ model, prompt });
    expect(gate).not.toHaveBeenCalled();
    expect(port.start).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ code: 'invalid_request' });
  });
});

describe('cli-executor · porta nativa', () => {
  const safe = () => decision('safe', 'Explique este parser.');

  it('falha da porta vira spawn_failed sem expor a mensagem interna', async () => {
    const port = fakePort();
    port.start = vi.fn<CliExecutorPort['start']>(async () => {
      throw new Error('C:\\Users\\fulano\\segredo: acesso negado');
    });
    const { events, run } = setup(safe, port);
    const result = await run();
    expect(events.map((e) => e.kind)).toEqual(['error', 'finished']);
    expect(events[0]).toMatchObject({ code: 'spawn_failed', message: CLI_MESSAGES.spawnFailed });
    expect(JSON.stringify(events)).not.toContain('fulano');
    expect(result.finished.status).toBe('failed');
  });

  it('falha da porta depois do finished mantém o fim que veio do processo', async () => {
    const port = fakePort();
    port.start = vi.fn<CliExecutorPort['start']>(async (request, onEvent) => {
      for (const raw of scriptOk(request)) onEvent(raw);
      throw new Error('canal fechado');
    });
    const { events, run } = setup(safe, port);
    const result = await run();
    expect(events.map((e) => e.kind)).toEqual(['started', 'output', 'finished']);
    expect(result.finished.status).toBe('completed');
  });

  it('porta que encerra sem finished ganha um fim sintético na sequência', async () => {
    const port = fakePort((request) => scriptOk(request).slice(0, 2));
    const { events, run } = setup(safe, port);
    const result = await run();
    expect(events.map((e) => e.kind)).toEqual(['started', 'output', 'error', 'finished']);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(events[2]).toMatchObject({ code: 'spawn_failed', message: CLI_MESSAGES.noFinish });
    expect(result.finished.status).toBe('failed');
  });

  it('ignora evento de outra execução, inválido ou posterior ao fim', async () => {
    const port = fakePort((request) => {
      const ok = scriptOk(request);
      return [
        { ...(ok[0] as object), runId: '99999999-2222-4333-8444-555555555555' },
        { kind: 'output', text: 'sem forma' },
        ...ok,
        { ...(ok[1] as object), seq: 3 },
      ];
    });
    const { events, run } = setup(safe, port);
    await run();
    expect(events.map((e) => e.kind)).toEqual(['started', 'output', 'finished']);
  });

  it('repassa o tempo máximo quando informado', async () => {
    const { port, executor } = setup(safe);
    await executor.run({
      target: 'ollama',
      model: 'llama3.2',
      prompt: 'Explique este parser.',
      timeoutMs: 5000,
      onEvent: () => {},
    });
    expect(port.calls[0].timeoutMs).toBe(5000);
  });

  it('cancelar delega à porta só com runId válido', async () => {
    const { port, executor } = setup(safe);
    await executor.cancel(RUN_ID);
    await executor.cancel('../../fora');
    expect(port.cancel).toHaveBeenCalledTimes(1);
    expect(port.cancel).toHaveBeenCalledWith(RUN_ID);
  });

  it('gera runId UUID por padrão', async () => {
    const port = fakePort();
    const executor = createCliExecutor({ port, gate: safe });
    const result = await executor.run({
      target: 'ollama',
      model: 'llama3.2',
      prompt: 'Explique este parser.',
      onEvent: () => {},
    });
    expect(parseExecutionEvent({ ...result.finished })).not.toBeNull();
    expect(port.calls[0].runId).toBe(result.runId);
  });
});

describe('cli-executor · tradutor do Ollama', () => {
  it('tira sequência de terminal e retorno de carro solto só da saída', () => {
    const [started, , error] = sample().map((raw) => parseExecutionEvent(raw)!);
    const output = parseExecutionEvent({ ...sample()[1], text: '\x1b[2Ka\rb\r\nc' })!;
    expect(translateOllama(output)).toMatchObject({ text: 'ab\r\nc' });
    expect(translateOllama(started)).toBe(started);
    expect(translateOllama(error)).toBe(error);
  });
});
