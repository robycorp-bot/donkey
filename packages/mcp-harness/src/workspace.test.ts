import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkspaceError, createWorkspace, isSecretPath, type Workspace } from './workspace';
import { callTool, setWorkspace } from './tools';

let raiz: string;
let fora: string;
let ws: Workspace;

beforeAll(() => {
  const base = mkdtempSync(join(tmpdir(), 'donkey-ws-'));
  raiz = join(base, 'projeto');
  fora = join(base, 'fora');
  mkdirSync(join(raiz, 'src'), { recursive: true });
  mkdirSync(fora, { recursive: true });

  writeFileSync(join(raiz, 'README.md'), '# Projeto\n\nSem nada sensível aqui.\n');
  writeFileSync(join(raiz, '.env'), 'API_KEY=supersecreto123\n');
  writeFileSync(join(raiz, 'cpf-123.456.789-09.txt'), 'conteudo qualquer\n');
  writeFileSync(
    join(raiz, 'src', 'cliente.ts'),
    'export const titular = "123.456.789-09";\nexport const contato = "fulano@exemplo.com";\n',
  );
  writeFileSync(join(raiz, 'src', 'binario.dat'), Buffer.from([0x41, 0x00, 0x42]));
  writeFileSync(join(fora, 'segredo-de-fora.txt'), 'nao deveria ser lido\n');
  try {
    symlinkSync(join(fora, 'segredo-de-fora.txt'), join(raiz, 'atalho.txt'));
  } catch {
    /* Windows sem permissão de symlink: o teste do link é pulado abaixo */
  }

  ws = createWorkspace(raiz);
  setWorkspace(ws);
});

afterAll(() => {
  setWorkspace(null);
  try {
    rmSync(raiz, { recursive: true, force: true });
  } catch {
    /* fixture temporária */
  }
});

describe('workspace · trava de caminho', () => {
  it('recusa subir de pasta com ..', () => {
    expect(() => ws.read('../fora/segredo-de-fora.txt')).toThrow(WorkspaceError);
    expect(() => ws.read('src/../../fora/segredo-de-fora.txt')).toThrow(/fora da raiz/i);
  });

  it('recusa caminho absoluto', () => {
    expect(() => ws.read(join(fora, 'segredo-de-fora.txt'))).toThrow(/relativo/i);
  });

  it('recusa link simbólico que aponta para fora', () => {
    const resultado = callTool('ler_arquivo', { caminho: 'atalho.txt' });
    // Sem permissão de symlink no Windows o arquivo nem existe; os dois desfechos são recusa.
    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).not.toContain('nao deveria ser lido');
  });
});

describe('workspace · segredo', () => {
  it('reconhece os arquivos que nunca se lê', () => {
    expect(isSecretPath('.env')).toBe(true);
    expect(isSecretPath('.env.production')).toBe(true);
    expect(isSecretPath('certs/servidor.pem')).toBe(true);
    expect(isSecretPath('config.local.json')).toBe(true);
    expect(isSecretPath('.git/config')).toBe(true);
    // Falhavam abertas antes do parecer do Security:
    expect(isSecretPath('prod.env')).toBe(true);
    expect(isSecretPath('infra/.aws/credentials')).toBe(true);
    expect(isSecretPath('.ssh/id_ed25519')).toBe(true);
    expect(isSecretPath('deploy/service-account-prod.json')).toBe(true);
    expect(isSecretPath('.pgpass')).toBe(true);
    // Não pode exagerar e bloquear código normal:
    expect(isSecretPath('src/app.ts')).toBe(false);
    expect(isSecretPath('src/environment.ts')).toBe(false);
    expect(isSecretPath('docs/keyboard.md')).toBe(false);
  });

  it('recusa ler .env sem nem abrir o conteúdo', () => {
    const resultado = callTool('ler_arquivo', { caminho: '.env' });
    expect(resultado.isError).toBe(true);
    expect(JSON.stringify(resultado)).not.toContain('supersecreto123');
  });

  it('lista o segredo como bloqueado, sem conteúdo', () => {
    const lista = JSON.parse(callTool('listar_arquivos', { caminho: '.' }).content[0].text);
    const env = lista.itens.find((i: { nome: string }) => i.nome === '.env');
    expect(env.bloqueado).toBe(true);
    expect(env.motivo).toContain('Segredo');
  });
});

describe('workspace · leitura auditada', () => {
  it('devolve arquivo limpo na íntegra', () => {
    const payload = JSON.parse(callTool('ler_arquivo', { caminho: 'README.md' }).content[0].text);
    expect(payload.veredito).toBe('safe');
    expect(payload.conteudo).toContain('Sem nada sensível');
    expect(payload.trechosRedigidos).toBe(0);
  });

  it('redige o sensível e nunca entrega o original', () => {
    const resultado = callTool('ler_arquivo', { caminho: 'src/cliente.ts' });
    const bruto = JSON.stringify(resultado);
    expect(bruto).not.toContain('123.456.789-09');
    expect(bruto).not.toContain('fulano@exemplo.com');
    const payload = JSON.parse(resultado.content[0].text);
    expect(payload.veredito).toBe('blocked');
    expect(payload.conteudo).toContain('[REDACTED:cpf]');
    expect(payload.conteudo).toContain('export const titular');
    expect(payload.achados).toEqual([
      { tipo: 'cpf', severidade: 'high', ocorrencias: 1 },
      { tipo: 'email', severidade: 'medium', ocorrencias: 1 },
    ]);
  });

  it('não entrega binário', () => {
    const resultado = callTool('ler_arquivo', { caminho: 'src/binario.dat' });
    expect(resultado.isError).toBe(true);
    expect(resultado.content[0].text).toContain('binário');
  });

  it('recusa arquivo acima do limite', () => {
    const pequeno = createWorkspace(raiz, 10);
    expect(() => pequeno.read('README.md')).toThrow(/grande demais/i);
  });

  it('redige PII no próprio nome do arquivo', () => {
    const lista = JSON.parse(callTool('listar_arquivos', {}).content[0].text);
    const nomes = lista.itens.map((i: { nome: string }) => i.nome).join(' ');
    expect(nomes).not.toContain('123.456.789-09');
    expect(nomes).toContain('[REDACTED:cpf]');
  });
});

describe('workspace · busca', () => {
  it('devolve caminho, linha e trecho auditado', () => {
    const payload = JSON.parse(
      callTool('buscar_no_projeto', { termo: 'titular' }).content[0].text,
    );
    expect(payload.total).toBe(1);
    expect(payload.ocorrencias[0].caminho).toBe('src/cliente.ts');
    expect(payload.ocorrencias[0].linha).toBe(1);
    expect(payload.ocorrencias[0].trecho).toContain('[REDACTED:cpf]');
    expect(JSON.stringify(payload)).not.toContain('123.456.789-09');
  });

  it('não encontra nada dentro de arquivo de segredo', () => {
    const payload = JSON.parse(
      callTool('buscar_no_projeto', { termo: 'supersecreto123' }).content[0].text,
    );
    expect(payload.total).toBe(0);
  });

  it('cobra o termo e respeita o teto do limite', () => {
    expect(callTool('buscar_no_projeto', {}).isError).toBe(true);
    const payload = JSON.parse(
      callTool('buscar_no_projeto', { termo: 'e', limite: 9999 }).content[0].text,
    );
    expect(payload.ocorrencias.length).toBeLessThanOrEqual(200);
  });
});
