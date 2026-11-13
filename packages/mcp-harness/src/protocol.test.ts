import { describe, expect, it } from 'vitest';
import { DEFAULT_PROTOCOL_VERSION, SERVER_NAME, handleLine, handleMessage } from './protocol';
import { TOOLS, callTool, isLocalTarget } from './tools';

function call(name: string, args: Record<string, unknown>) {
  const response = handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const result = response?.result as { content: { text: string }[]; isError?: boolean };
  return { result, payload: () => JSON.parse(result.content[0].text) };
}

describe('protocolo MCP', () => {
  it('responde o handshake e devolve a versão pedida pelo cliente', () => {
    const response = handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {} },
    });
    const result = response?.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe('2025-03-26');
    expect((result.serverInfo as { name: string }).name).toBe(SERVER_NAME);
  });

  it('impõe a nossa versão quando o cliente manda lixo', () => {
    const response = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 7 } });
    expect((response?.result as Record<string, unknown>).protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
  });

  it('não responde notificação', () => {
    expect(handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('lista as três ferramentas com esquema de entrada', () => {
    const response = handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const { tools } = response?.result as { tools: typeof TOOLS };
    expect(tools.map((t) => t.name)).toEqual(['auditar_texto', 'sintetizar_dados', 'status_grau33']);
    for (const tool of tools) expect(tool.inputSchema.type).toBe('object');
  });

  it('recusa método desconhecido e JSON quebrado', () => {
    expect(handleMessage({ jsonrpc: '2.0', id: 3, method: 'resources/list' })?.error?.code).toBe(-32601);
    expect(handleLine('{isso não é json')?.error?.code).toBe(-32700);
    expect(handleLine('[1,2,3]')?.error?.code).toBe(-32600);
  });

  it('responde ping', () => {
    expect(handleMessage({ jsonrpc: '2.0', id: 4, method: 'ping' })?.result).toEqual({});
  });
});

describe('ferramentas', () => {
  it('audita texto limpo e libera', () => {
    const { payload } = call('auditar_texto', { texto: 'Explique este parser de XML.' });
    expect(payload().veredito).toBe('safe');
    expect(payload().achados).toHaveLength(0);
    expect(payload().aviso).toBeUndefined();
  });

  it('nunca devolve o trecho sensível original ao CLI', () => {
    const { result, payload } = call('auditar_texto', { texto: 'O titular 123.456.789-09 ligou.' });
    const bruto = JSON.stringify(result);
    expect(bruto).not.toContain('123.456.789-09');
    expect(payload().veredito).toBe('blocked');
    expect(payload().achados[0]).toEqual({ tipo: 'cpf', severidade: 'high', inicio: 10, fim: 24 });
    expect(payload().textoSeguro).toContain('[REDACTED:cpf]');
    expect(payload().aviso).toContain('Grau 33');
  });

  it('respeita estrito=false para pedir revisão em vez de bloquear', () => {
    const { payload } = call('auditar_texto', { texto: 'CPF 123.456.789-09', estrito: false });
    expect(payload().veredito).toBe('needs_review');
  });

  it('cobra os campos obrigatórios', () => {
    expect(call('auditar_texto', {}).result.isError).toBe(true);
    expect(call('sintetizar_dados', { formato: 'planilha' }).result.isError).toBe(true);
    expect(callTool('inexistente', {}).isError).toBe(true);
  });

  it('sintetiza com a forma pedida e avisa que é molde fixo', () => {
    const { payload } = call('sintetizar_dados', { formato: 'json' });
    expect(payload().exemplo).toContain('SYN-0001');
    expect(payload().aviso).toContain('Molde fixo');
  });

  it('classifica destino local e externo', () => {
    expect(isLocalTarget('ollama')).toBe(true);
    expect(isLocalTarget('http://127.0.0.1:11434')).toBe(true);
    expect(isLocalTarget('anthropic')).toBe(false);
    expect(call('status_grau33', { alvo: 'anthropic' }).payload().grau33).toBe(true);
    expect(call('status_grau33', { alvo: 'ollama' }).payload().perimetroLocal).toBe(true);
    expect(call('status_grau33', {}).payload().grau33).toBeUndefined();
  });
});
