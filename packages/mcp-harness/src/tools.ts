import { GRAU_33_LABEL, runHarness, type SensitiveFinding } from '@donkey/harness';
import { WorkspaceError, createWorkspace, type Workspace } from './workspace';

/**
 * As ferramentas que o servidor expõe.
 *
 * Regra que vale para todas: a resposta nunca devolve o trecho sensível original.
 * Quem chama é um CLI de terceiro — ou seja, Grau 33. Devolvemos tipo, severidade,
 * posição e o texto já redigido; o conteúdo bruto fica nesta máquina.
 */

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Perímetro local: processamento aqui dentro não é Grau 33 (ADR-006). */
const LOCAL_TARGETS = ['ollama', 'localhost', '127.0.0.1', '::1', '0.0.0.0'];

let workspace: Workspace | null = null;

/** Injeta a raiz nos testes; em produção vem de DONKEY_WORKSPACE ou do cwd do processo. */
export function setWorkspace(next: Workspace | null): void {
  workspace = next;
}

function getWorkspace(): Workspace {
  if (!workspace) workspace = createWorkspace(process.env.DONKEY_WORKSPACE ?? process.cwd());
  return workspace;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'auditar_texto',
    description:
      'Audita um texto antes de ele sair para um provedor externo (Grau 33). Devolve o veredito ' +
      '(safe, needs_review ou blocked), os achados de dado sensível por tipo e posição, e a versão ' +
      'redigida pronta para envio. Nunca devolve o trecho sensível original.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Conteúdo a auditar.' },
        estrito: {
          type: 'boolean',
          description: 'Quando verdadeiro (padrão), achado de severidade alta vira blocked.',
        },
      },
      required: ['texto'],
    },
  },
  {
    name: 'sintetizar_dados',
    description:
      'Devolve um exemplo fictício com a mesma forma do dado real (XML, JSON ou texto), para o ' +
      'modelo entender a estrutura sem receber conteúdo sigiloso. Versão inicial: molde fixo.',
    inputSchema: {
      type: 'object',
      properties: {
        formato: { type: 'string', enum: ['xml', 'json', 'texto'], description: 'Forma desejada.' },
      },
      required: ['formato'],
    },
  },
  {
    name: 'listar_arquivos',
    description:
      'Lista o conteúdo de uma pasta do projeto. Caminhos são sempre relativos à raiz. ' +
      'Arquivos de segredo aparecem marcados como bloqueados e nunca têm o conteúdo lido.',
    inputSchema: {
      type: 'object',
      properties: {
        caminho: { type: 'string', description: 'Pasta relativa à raiz. Padrão: a própria raiz.' },
      },
    },
  },
  {
    name: 'ler_arquivo',
    description:
      'Lê um arquivo de texto do projeto já auditado pelo Harness: trechos sensíveis vêm ' +
      'substituídos por marcadores. Use isto em vez de ferramentas próprias de leitura de disco — ' +
      'o conteúdo original não sai desta máquina.',
    inputSchema: {
      type: 'object',
      properties: { caminho: { type: 'string', description: 'Arquivo relativo à raiz.' } },
      required: ['caminho'],
    },
  },
  {
    name: 'buscar_no_projeto',
    description:
      'Procura um termo nos arquivos de texto do projeto e devolve caminho, linha e o trecho ' +
      'já auditado. Pula pastas de dependência e de build, e nunca abre arquivo de segredo.',
    inputSchema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Texto a procurar, sem diferenciar maiúsculas.' },
        limite: { type: 'number', description: 'Máximo de ocorrências. Padrão 50, teto 200.' },
      },
      required: ['termo'],
    },
  },
  {
    name: 'status_grau33',
    description:
      'Explica a política de Grau 33 do Donkey e diz se um destino está fora do perímetro local. ' +
      'Use antes de mandar qualquer conteúdo para um serviço externo.',
    inputSchema: {
      type: 'object',
      properties: {
        alvo: {
          type: 'string',
          description: 'Identificador do provedor ou host de destino. Ex.: anthropic, ollama, 127.0.0.1.',
        },
      },
    },
  },
];

function text(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function failure(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Achado sem o excerpt: posição e tipo bastam para o agente agir. */
function publicFinding(finding: SensitiveFinding) {
  return {
    tipo: finding.kind,
    severidade: finding.severity,
    inicio: finding.start,
    fim: finding.end,
  };
}

export function isLocalTarget(alvo: string): boolean {
  const normalized = alvo.trim().toLowerCase();
  if (!normalized) return false;
  return LOCAL_TARGETS.some(
    (local) => normalized === local || normalized.includes(`//${local}`) || normalized.startsWith(`${local}:`),
  );
}

export function callTool(name: string, args: Record<string, unknown>): ToolResult {
  if (name === 'auditar_texto') {
    const texto = args.texto;
    if (typeof texto !== 'string') return failure('O campo "texto" é obrigatório e deve ser string.');
    const estrito = typeof args.estrito === 'boolean' ? args.estrito : true;
    const outcome = runHarness({ text: texto, purpose: 'chat', strict: estrito });
    return text({
      veredito: outcome.verdict,
      mensagem: outcome.userMessage,
      achados: outcome.findings.map(publicFinding),
      trechosRedigidos: outcome.redactedCount,
      textoSeguro: outcome.safeText,
      aviso:
        outcome.verdict === 'safe'
          ? undefined
          : `Não envie o texto original para ${GRAU_33_LABEL}. Use textoSeguro ou peça confirmação ao humano.`,
    });
  }

  if (name === 'sintetizar_dados') {
    const formato = args.formato;
    if (formato !== 'xml' && formato !== 'json' && formato !== 'texto')
      return failure('O campo "formato" deve ser xml, json ou texto.');
    const moldes = {
      xml: '<registro><id>SYN-0001</id><nome>Cliente Fictício</nome><valor>0.00</valor></registro>',
      json: '{"id":"SYN-0001","nome":"Cliente Fictício","valor":0}',
      texto: 'Conteúdo sintético — mesma forma do original, sem dado real.',
    };
    return text({
      formato,
      exemplo: moldes[formato],
      aviso: 'Molde fixo nesta versão: ainda não deriva a forma do dado real.',
    });
  }

  if (name === 'status_grau33') {
    const alvo = typeof args.alvo === 'string' ? args.alvo : '';
    const local = alvo ? isLocalTarget(alvo) : null;
    return text({
      politica: `${GRAU_33_LABEL}: toda API de LLM ou serviço de terceiro fora desta máquina é zona não confiável.`,
      regras: [
        'Em dúvida sobre PII ou sigilo, bloqueie o envio e peça auditoria ao humano (fail-closed).',
        'O destino externo recebe o mínimo: resumo, trecho redigido ou exemplo sintético.',
        'Processamento só local (loopback) não é Grau 33.',
      ],
      alvo: alvo || undefined,
      grau33: local === null ? undefined : !local,
      perimetroLocal: local === null ? undefined : local,
    });
  }

  if (name === 'listar_arquivos' || name === 'ler_arquivo' || name === 'buscar_no_projeto') {
    try {
      const ws = getWorkspace();
      if (name === 'listar_arquivos')
        return text(ws.list(typeof args.caminho === 'string' ? args.caminho : '.'));
      if (name === 'ler_arquivo') {
        if (typeof args.caminho !== 'string')
          return failure('O campo "caminho" é obrigatório e deve ser string.');
        return text(ws.read(args.caminho));
      }
      if (typeof args.termo !== 'string')
        return failure('O campo "termo" é obrigatório e deve ser string.');
      const limite =
        typeof args.limite === 'number' && Number.isFinite(args.limite)
          ? Math.min(Math.max(Math.trunc(args.limite), 1), 200)
          : 50;
      return text(ws.search(args.termo, limite));
    } catch (error) {
      // Mensagem do WorkspaceError é pública por construção; qualquer outra falha vira recusa genérica.
      if (error instanceof WorkspaceError) return failure(error.message);
      return failure('Não foi possível atender a esse acesso ao projeto.');
    }
  }

  return failure(`Ferramenta desconhecida: ${name}`);
}
