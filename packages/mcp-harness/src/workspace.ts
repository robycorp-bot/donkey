import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { detectSensitive, redactText, runHarness, type SensitiveFinding } from '@donkey/harness';

/**
 * Acesso ao projeto para o agente delegado (ADR-007).
 *
 * Quem enxerga o disco é o Donkey; o CLI de terceiro pede por aqui e recebe
 * conteúdo já auditado. Três travas, nesta ordem:
 *   1. o caminho nunca sai da raiz, nem por `..`, nem por link simbólico;
 *   2. arquivo de segredo não é lido — nem redigido, nem resumido: é recusado;
 *   3. o que sobra passa pelo Harness antes de virar resposta.
 */

export const MAX_BYTES = 2 * 1024 * 1024;
const SEARCH_SKIP = ['node_modules', 'dist', 'build', 'target', '.git', 'coverage', 'test-results'];

/** `REGRAS.md §5`: segredo não se lê. Nunca chega ao Harness, nunca vira resposta. */
const SECRET_PATTERNS: RegExp[] = [
  /^\.env$/i,
  /^\.env\..+$/i,
  /\.env$/i, // prod.env, staging.env
  /^config\.local\..+$/i,
  /\.(pem|key|pfx|p12|jks|keystore|asc|gpg)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^(credentials|secrets?)(\.(json|ya?ml|toml|ini|txt))?$/i,
  /\.credentials$/i,
  /^\.(npmrc|netrc|pgpass|htpasswd)$/i,
  /^service-account.*\.json$/i,
];

/** Pastas inteiras que nunca são abertas, qualquer que seja o arquivo dentro. */
const SECRET_DIRS = ['.git', '.ssh', '.aws', '.gnupg', '.gcloud', '.azure', '.kube', '.docker'];

export class WorkspaceError extends Error {}

export function isSecretPath(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.some((part) => SECRET_DIRS.includes(part.toLowerCase()))) return true;
  const name = basename(relativePath);
  return SECRET_PATTERNS.some((pattern) => pattern.test(name));
}

/** Nome de arquivo também pode carregar PII ("cpf-12345678909.pdf"). */
function redactName(name: string): string {
  const findings = detectSensitive(name);
  return findings.length ? redactText(name, findings).text : name;
}

function aggregate(findings: SensitiveFinding[]) {
  const byKind = new Map<string, { tipo: string; severidade: string; ocorrencias: number }>();
  for (const finding of findings) {
    const current = byKind.get(finding.kind);
    if (current) current.ocorrencias += 1;
    else byKind.set(finding.kind, { tipo: finding.kind, severidade: finding.severity, ocorrencias: 1 });
  }
  return [...byKind.values()];
}

export interface Workspace {
  readonly root: string;
  list(relativePath?: string): unknown;
  read(relativePath: string): unknown;
  search(termo: string, limite?: number): unknown;
}

export function createWorkspace(rootInput: string, maxBytes = MAX_BYTES): Workspace {
  if (!existsSync(rootInput)) throw new WorkspaceError('Raiz do workspace não existe.');
  const root = realpathSync(rootInput);

  /** Resolve relativo à raiz e recusa qualquer saída, inclusive via link simbólico. */
  function safePath(relativePath: string): { full: string; rel: string } {
    if (typeof relativePath !== 'string') throw new WorkspaceError('Caminho inválido.');
    if (isAbsolute(relativePath.trim()) && relativePath.trim() !== '')
      throw new WorkspaceError('Use caminho relativo à raiz do projeto.');
    const wanted = relativePath.trim().replace(/^[\\/]+/, '');
    const full = resolve(root, wanted);
    const rel = relative(root, full);
    if (rel.startsWith('..') || isAbsolute(rel))
      throw new WorkspaceError('Caminho fora da raiz do projeto.');
    if (existsSync(full)) {
      const real = realpathSync(full);
      const realRel = relative(root, real);
      if (realRel.startsWith('..') || isAbsolute(realRel))
        throw new WorkspaceError('Este caminho aponta para fora da raiz do projeto.');
    }
    return { full, rel: rel === '' ? '.' : rel.split(sep).join('/') };
  }

  function readText(full: string): string {
    const info = statSync(full);
    if (info.isDirectory()) throw new WorkspaceError('Isto é uma pasta. Use listar_arquivos.');
    if (info.size > maxBytes)
      throw new WorkspaceError(
        `Arquivo grande demais (${info.size} bytes, limite ${maxBytes}). Use buscar_no_projeto.`,
      );
    const raw = readFileSync(full);
    if (raw.includes(0))
      throw new WorkspaceError('Arquivo binário: o agente não recebe este conteúdo.');
    return raw.toString('utf8');
  }

  return {
    root,

    list(relativePath = '.') {
      const { full, rel } = safePath(relativePath || '.');
      if (!existsSync(full)) throw new WorkspaceError('Pasta não encontrada.');
      if (!statSync(full).isDirectory())
        throw new WorkspaceError('Isto é um arquivo. Use ler_arquivo.');
      const itens = readdirSync(full, { withFileTypes: true })
        .map((entry) => {
          const childRel = rel === '.' ? entry.name : `${rel}/${entry.name}`;
          const secret = isSecretPath(childRel);
          return {
            nome: redactName(entry.name),
            caminho: redactName(childRel),
            tipo: entry.isDirectory() ? 'pasta' : 'arquivo',
            bloqueado: secret || undefined,
            motivo: secret ? 'Segredo: conteúdo não é lido nem enviado.' : undefined,
          };
        })
        .sort((a, b) =>
          a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === 'pasta' ? -1 : 1,
        );
      return { caminho: rel, itens };
    },

    read(relativePath: string) {
      const { full, rel } = safePath(relativePath);
      if (isSecretPath(rel))
        throw new WorkspaceError('Arquivo de segredo: o Donkey não lê nem repassa este conteúdo.');
      if (!existsSync(full)) throw new WorkspaceError('Arquivo não encontrado.');
      const content = readText(full);
      const outcome = runHarness({ text: content, purpose: 'chat', strict: true });
      // Redação em tamanho cheio: o resumo do Harness cortaria código no meio.
      const body = outcome.findings.length ? redactText(content, outcome.findings).text : content;
      return {
        caminho: rel,
        linhas: content.split('\n').length,
        veredito: outcome.verdict,
        achados: aggregate(outcome.findings),
        trechosRedigidos: outcome.findings.length,
        conteudo: body,
        aviso:
          outcome.findings.length > 0
            ? 'Trechos sensíveis foram substituídos por marcadores. Não peça o original: ele não sai desta máquina.'
            : undefined,
      };
    },

    search(termo: string, limite = 50) {
      if (typeof termo !== 'string' || !termo.trim())
        throw new WorkspaceError('Informe o termo de busca.');
      const alvo = termo.toLowerCase();
      const ocorrencias: { caminho: string; linha: number; trecho: string }[] = [];

      const walk = (dir: string, rel: string) => {
        if (ocorrencias.length >= limite) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (ocorrencias.length >= limite) return;
          const childRel = rel === '.' ? entry.name : `${rel}/${entry.name}`;
          if (isSecretPath(childRel)) continue;
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) {
            if (SEARCH_SKIP.includes(entry.name)) continue;
            walk(join(dir, entry.name), childRel);
            continue;
          }
          let content: string;
          try {
            content = readText(join(dir, entry.name));
          } catch {
            continue; // binário, grande demais ou ilegível: fora da busca
          }
          const linhas = content.split('\n');
          for (let i = 0; i < linhas.length && ocorrencias.length < limite; i += 1) {
            if (!linhas[i].toLowerCase().includes(alvo)) continue;
            const bruto = linhas[i].trim().slice(0, 240);
            const findings = detectSensitive(bruto);
            ocorrencias.push({
              caminho: childRel,
              linha: i + 1,
              trecho: findings.length ? redactText(bruto, findings).text : bruto,
            });
          }
        }
      };

      walk(root, '.');
      return {
        termo,
        total: ocorrencias.length,
        truncado: ocorrencias.length >= limite,
        ocorrencias,
      };
    },
  };
}
