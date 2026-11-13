import { TOOLS, callTool } from './tools';

/**
 * JSON-RPC 2.0 do MCP sobre stdio, escrito à mão e sem dependência.
 * Uma mensagem por linha, UTF-8. Só o que o transporte stdio usa:
 * initialize, notifications/initialized, ping, tools/list e tools/call.
 */

export const SERVER_NAME = 'donkey-harness';
export const SERVER_VERSION = '0.1.0';
export const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function fail(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Aceita a versão do cliente quando ela tem a forma de data; senão impõe a nossa. */
function negotiateVersion(requested: unknown): string {
  return typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested)
    ? requested
    : DEFAULT_PROTOCOL_VERSION;
}

/** Trata uma mensagem já decodificada. Devolve null quando é notificação (não se responde). */
export function handleMessage(message: JsonRpcMessage): JsonRpcResponse | null {
  const id = message.id ?? null;
  const method = message.method;

  if (typeof method !== 'string') return fail(id, -32600, 'Requisição inválida: falta o método.');

  // Notificações não têm id e não recebem resposta.
  if (method.startsWith('notifications/')) return null;

  if (method === 'initialize') {
    const params = asRecord(message.params);
    return ok(id, {
      protocolVersion: negotiateVersion(params.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions:
        'Ferramentas do Harness do Donkey. Chame auditar_texto antes de mandar qualquer conteúdo ' +
        'para um serviço externo e use textoSeguro no lugar do original.',
    });
  }

  if (method === 'ping') return ok(id, {});

  if (method === 'tools/list') return ok(id, { tools: TOOLS });

  if (method === 'tools/call') {
    const params = asRecord(message.params);
    const name = params.name;
    if (typeof name !== 'string') return fail(id, -32602, 'Parâmetro "name" ausente.');
    try {
      return ok(id, callTool(name, asRecord(params.arguments)));
    } catch (error) {
      // Fail-closed: falha do detector não vira silêncio nem liberação.
      const detail = error instanceof Error ? error.message : String(error);
      return ok(id, {
        content: [{ type: 'text', text: `Auditoria falhou, trate como bloqueado: ${detail}` }],
        isError: true,
      });
    }
  }

  return fail(id, -32601, `Método não suportado: ${method}`);
}

/** Trata uma linha crua do stdin. Devolve a linha de resposta, ou null. */
export function handleLine(line: string): JsonRpcResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return fail(null, -32700, 'JSON inválido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return fail(null, -32600, 'Requisição inválida.');
  return handleMessage(parsed as JsonRpcMessage);
}
