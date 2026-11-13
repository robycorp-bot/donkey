import { getProvider } from './providers';
import { isFree, type BlendStep, type ChatFn } from './agent-blend';
import type { ProviderId, ProviderStatus } from './models';

/** Roles of the virtual software factory (see personas/). */
export type SquadRole =
  | 'mediator'
  | 'po'
  | 'tech-lead'
  | 'architect'
  | 'backend'
  | 'frontend'
  | 'database'
  | 'devops'
  | 'qa'
  | 'tester'
  | 'security'
  | 'reviewer'
  | 'git';

export type Seniority = 'junior' | 'pleno' | 'senior';
export type Complexity = 'simple' | 'medium' | 'complex';
export type PlanSource = 'mediator' | 'heuristic';

export interface SquadMember {
  role: SquadRole;
  seniority?: Seniority;
  title: string;
  provider: ProviderId | null;
  model: string | null;
  free: boolean;
  why: string;
}

export interface SquadPlan {
  task: string;
  complexity: Complexity;
  freeOnly: boolean;
  members: SquadMember[];
  /** Roles the task needs but no ready provider could fill. */
  unfilled: SquadRole[];
  /** Who decided the seats: the mediator model, or the local keyword fallback. */
  source: PlanSource;
  note?: string;
}

type Status = Pick<ProviderStatus, 'id' | 'configured'>;

const ALL_ROLES: SquadRole[] = [
  'mediator', 'po', 'tech-lead', 'architect', 'backend', 'frontend', 'database',
  'devops', 'qa', 'tester', 'security', 'reviewer', 'git',
];

export const SQUAD_TITLES: Record<SquadRole, string> = {
  mediator: 'Mediador',
  po: 'PO',
  'tech-lead': 'Tech Leader',
  architect: 'Arquiteto',
  backend: 'Backend',
  frontend: 'Frontend',
  database: 'Database',
  devops: 'DevOps',
  qa: 'QA',
  tester: 'Tester',
  security: 'Segurança',
  reviewer: 'Revisor',
  git: 'Git',
};

/** Roles that talk to a model. The mediator runs before approval; git is a human/CLI action. */
const NON_EXECUTABLE: SquadRole[] = ['mediator', 'git'];
/** Governance (CLAUDE.md): nothing reaches Git without the reviewer. */
const LOCKED: SquadRole[] = ['mediator', 'reviewer'];

const SQUAD_PROMPTS: Record<Exclude<SquadRole, 'mediator' | 'git'>, string> = {
  po: 'Você é o PO. Transforme a tarefa em user stories curtas com critérios de aceite verificáveis. Não escreva código.',
  'tech-lead': 'Você é o Tech Leader. Quebre o trabalho em tarefas ordenadas por dependência, aponte riscos e decisões. Não escreva o código final.',
  architect: 'Você é o Arquiteto. Defina estrutura, módulos, contratos e trade-offs em poucas linhas. Não escreva o código final.',
  backend: 'Você é do Backend. Implemente regras de negócio e APIs conforme o plano. Entregue código completo e testável.',
  frontend: 'Você é do Frontend. Implemente a interface conforme o plano, com acessibilidade e estados de erro/carregamento.',
  database: 'Você é do Database. Entregue modelagem, migrações e índices necessários, com SQL claro.',
  devops: 'Você é do DevOps. Entregue o que for preciso de build, pipeline e deploy. Nunca publique em produção sem aprovação humana.',
  qa: 'Você é o QA. Liste cenários de regressão, casos de borda e critérios de aceite que ainda não estão cobertos.',
  tester: 'Você é o Tester. Escreva os testes automatizados da entrega (unitários e de integração) cobrindo o caminho feliz e as falhas.',
  security: 'Você é da Segurança. Audite OWASP Top 10, segredos e LGPD. Se houver falha grave, termine com "REPROVADO" e o motivo.',
  reviewer: 'Você é o Revisor. Audite o resultado dos colegas: bugs, padrões, testes faltando. Liste problemas por gravidade e termine com APROVADO ou REPROVADO.',
};

const has = (task: string, words: RegExp) => words.test(task.toLowerCase());

export function classifyComplexity(task: string): Complexity {
  const text = task.trim();
  const hard = has(text, /(arquitetura|microsservi|migra[cç][aã]o|autentica|oauth|pagamento|tempo real|integra[cç][aã]o|refator|seguran)/);
  if (hard || text.length > 400) return 'complex';
  if (text.length > 120 || has(text, /(api|banco|tabela|crud|formul|teste|login|dashboard)/)) return 'medium';
  return 'simple';
}

const SENIORITY: Record<Complexity, Seniority> = { simple: 'junior', medium: 'pleno', complex: 'senior' };

interface Need {
  role: SquadRole;
  seniority?: Seniority;
  why: string;
}

/** Keyword fallback: decides the seats without calling any model. */
export function chooseSeats(task: string, complexity: Complexity): Need[] {
  const level = SENIORITY[complexity];
  const needs: Need[] = [
    { role: 'po', why: 'Transforma o pedido em critérios de aceite.' },
    { role: 'tech-lead', why: 'Quebra o trabalho e arbitra conflitos entre agentes.' },
  ];
  if (complexity === 'complex')
    needs.push({ role: 'architect', why: 'Tarefa complexa: precisa de desenho antes do código.' });

  const front = has(task, /(tela|ui|ux|interface|formul|componente|css|layout|p[aá]gina|dashboard|bot[aã]o|svelte|tauri)/);
  const data = has(task, /(banco|tabela|sql|mysql|postgres|migra|[ií]ndice|modelagem|schema|query)/);
  const infra = has(task, /(deploy|docker|ci\/cd|pipeline|infra|hostinger|vps|kubernetes)/);
  const back = has(task, /(api|endpoint|servi[cç]o|regra|backend|rota|integra|autentica|login|l[oó]gica)/) || (!front && !data && !infra);

  if (back) needs.push({ role: 'backend', seniority: level, why: `Regras de negócio e API (nível ${level} pela complexidade).` });
  if (front) needs.push({ role: 'frontend', seniority: level, why: 'A tarefa toca interface.' });
  if (data) needs.push({ role: 'database', why: 'A tarefa envolve modelagem ou migração de dados.' });
  if (infra) needs.push({ role: 'devops', why: 'A tarefa envolve infraestrutura ou entrega.' });

  needs.push({ role: 'tester', why: 'Escreve e roda os testes da entrega.' });
  if (complexity !== 'simple') needs.push({ role: 'qa', why: 'Plano de regressão e caso de borda.' });
  if (has(task, /(autentica|login|senha|token|jwt|oauth|pagamento|segredo|lgpd|upload)/))
    needs.push({ role: 'security', why: 'Tarefa sensível: pode vetar a entrega.' });
  needs.push({ role: 'reviewer', why: 'Nada chega ao Git sem o aval do revisor.' });
  needs.push({ role: 'git', why: 'Branch, commit e PR após aprovação.' });
  return needs;
}

// Thinking seats prefer strong models; writing seats prefer local/free. The mediator is a cheap filter, so free first.
const THINKERS: SquadRole[] = ['po', 'tech-lead', 'architect', 'security', 'reviewer'];
const THINKER_PREF: ProviderId[] = ['anthropic', 'openai', 'google', 'grok', 'openrouter', 'minhavida', 'ollama'];
const WRITER_PREF: ProviderId[] = ['ollama', 'minhavida', 'google', 'openrouter', 'grok', 'openai', 'anthropic'];
const FREE_PREF: ProviderId[] = ['minhavida', 'ollama'];

function readySet(statuses: Status[]): Set<ProviderId> {
  return new Set(statuses.filter((s) => s.configured).map((s) => s.id));
}

function pick(role: SquadRole, ready: Set<ProviderId>, freeOnly: boolean): ProviderId | null {
  let order: ProviderId[];
  if (freeOnly) order = THINKERS.includes(role) ? FREE_PREF : [...FREE_PREF].reverse();
  else if (role === 'mediator') order = [...FREE_PREF, ...THINKER_PREF];
  else order = THINKERS.includes(role) ? THINKER_PREF : WRITER_PREF;
  return order.find((id) => ready.has(id) && getProvider(id).supported) ?? null;
}

function makeMember(need: Need, provider: ProviderId | null): SquadMember {
  return {
    role: need.role,
    seniority: need.seniority,
    title: SQUAD_TITLES[need.role],
    provider,
    model: provider ? getProvider(provider).defaultModel : null,
    free: provider ? isFree(provider) : true,
    why: need.why,
  };
}

const unfilledOf = (members: SquadMember[]) => members.filter((m) => !m.provider).map((m) => m.role);

function assemble(
  task: string,
  complexity: Complexity,
  seats: Need[],
  statuses: Status[],
  freeOnly: boolean,
  source: PlanSource,
  note?: string,
): SquadPlan {
  const ready = readySet(statuses);
  const withMediator: Need[] = [
    { role: 'mediator', why: 'Filtra o pedido, monta o squad e fala com o humano.' },
    ...seats.filter((s) => s.role !== 'mediator'),
  ];
  const members = withMediator.map((seat) => makeMember(seat, pick(seat.role, ready, freeOnly)));
  return { task: task.trim(), complexity, freeOnly, members, unfilled: unfilledOf(members), source, note };
}

export function buildSquadPlan(task: string, statuses: Status[], options: { freeOnly?: boolean } = {}): SquadPlan {
  const complexity = classifyComplexity(task);
  return assemble(task, complexity, chooseSeats(task, complexity), statuses, options.freeOnly ?? true, 'heuristic');
}

/* ---------- Mediator model: asks an LLM to choose the squad, falls back to keywords ---------- */

const MEDIATOR_PROMPT = `Você é o Mediador de uma fábrica de software virtual. Leia a tarefa e monte o menor squad que a resolve com qualidade.
Papéis possíveis: po, tech-lead, architect, backend, frontend, database, devops, qa, tester, security, reviewer, git.
Níveis (só para backend e frontend): junior, pleno, senior.
Responda APENAS com JSON, sem texto extra, neste formato:
{"complexity":"simple|medium|complex","seats":[{"role":"po","seniority":"pleno","why":"motivo curto"}]}`;

const isRole = (value: unknown): value is SquadRole => typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
const isSeniority = (value: unknown): value is Seniority => value === 'junior' || value === 'pleno' || value === 'senior';
const isComplexity = (value: unknown): value is Complexity => value === 'simple' || value === 'medium' || value === 'complex';

/** Pulls the first JSON object out of a model reply (handles code fences and chatter). */
export function parseMediatorReply(text: string): { complexity: Complexity; seats: Need[] } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const record = data as { complexity?: unknown; seats?: unknown };
  if (!record || !Array.isArray(record.seats)) return null;
  const seen = new Set<SquadRole>();
  const seats: Need[] = [];
  for (const raw of record.seats as Array<Record<string, unknown>>) {
    if (!raw || !isRole(raw.role) || raw.role === 'mediator' || seen.has(raw.role)) continue;
    seen.add(raw.role);
    seats.push({
      role: raw.role,
      seniority: isSeniority(raw.seniority) && (raw.role === 'backend' || raw.role === 'frontend') ? raw.seniority : undefined,
      why: typeof raw.why === 'string' && raw.why.trim() ? raw.why.trim().slice(0, 160) : 'Indicado pelo mediador.',
    });
  }
  const doers: SquadRole[] = ['backend', 'frontend', 'database', 'devops'];
  if (!seats.some((s) => doers.includes(s.role))) return null; // a squad with nobody to do the work is useless
  if (!seen.has('reviewer')) seats.push({ role: 'reviewer', why: 'Obrigatório: nada chega ao Git sem o revisor.' });
  return { complexity: isComplexity(record.complexity) ? record.complexity : 'medium', seats };
}

const ORDER: SquadRole[] = ['po', 'tech-lead', 'architect', 'database', 'backend', 'frontend', 'devops', 'tester', 'qa', 'security', 'reviewer', 'git'];
const byFlow = (a: Need, b: Need) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role);

/** Asks the mediator model to pick the seats. Any failure degrades to the keyword plan, never throws. */
export async function mediateSquad(
  task: string,
  statuses: Status[],
  chat: ChatFn,
  options: { freeOnly?: boolean } = {},
): Promise<SquadPlan> {
  const freeOnly = options.freeOnly ?? true;
  const fallback = (note: string): SquadPlan => ({ ...buildSquadPlan(task, statuses, { freeOnly }), note });
  if (!task.trim()) return fallback('Tarefa vazia.');
  const provider = pick('mediator', readySet(statuses), freeOnly);
  if (!provider) return fallback('Sem provedor para o mediador; usei a heurística local.');
  try {
    const reply = await chat(provider, getProvider(provider).defaultModel, [
      { role: 'user', content: `${MEDIATOR_PROMPT}\n\n## Tarefa\n${task.trim()}` },
    ]);
    const parsed = parseMediatorReply(reply.text);
    if (!parsed) return fallback('O mediador respondeu fora do formato; usei a heurística local.');
    const seats = [...parsed.seats.filter((s) => s.role !== 'git').sort(byFlow), { role: 'git' as const, why: 'Branch, commit e PR após aprovação.' }];
    return assemble(task, parsed.complexity, seats, statuses, freeOnly, 'mediator');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fallback(`Mediador indisponível (${reason.slice(0, 80)}); usei a heurística local.`);
  }
}

/* ---------- Human edits on the preview ---------- */

export function removeMember(plan: SquadPlan, index: number): SquadPlan {
  const member = plan.members[index];
  if (!member || LOCKED.includes(member.role)) return plan;
  const members = plan.members.filter((_, i) => i !== index);
  return { ...plan, members, unfilled: unfilledOf(members) };
}

export function updateMember(
  plan: SquadPlan,
  index: number,
  patch: { provider?: ProviderId; model?: string },
): SquadPlan {
  const current = plan.members[index];
  if (!current) return plan;
  const provider = patch.provider ?? current.provider;
  if (provider && plan.freeOnly && !isFree(provider)) return plan; // free-only mode never accepts a paid seat
  const providerChanged = patch.provider !== undefined && patch.provider !== current.provider;
  const model = patch.model ?? (providerChanged && provider ? getProvider(provider).defaultModel : current.model);
  const members = plan.members.map((m, i) =>
    i === index ? { ...m, provider, model, free: provider ? isFree(provider) : true } : m,
  );
  return { ...plan, members, unfilled: unfilledOf(members) };
}

/** Roles the human can still add (everything except the ones already on the squad). */
export function addableRoles(plan: SquadPlan): SquadRole[] {
  const present = new Set(plan.members.map((m) => m.role));
  return ALL_ROLES.filter((role) => !present.has(role));
}

export function addMember(plan: SquadPlan, role: SquadRole, statuses: Status[]): SquadPlan {
  if (plan.members.some((m) => m.role === role)) return plan;
  const level = SENIORITY[plan.complexity];
  const member = makeMember(
    { role, seniority: role === 'backend' || role === 'frontend' ? level : undefined, why: 'Adicionado por você.' },
    pick(role, readySet(statuses), plan.freeOnly),
  );
  const members = [...plan.members, member].sort((a, b) =>
    a.role === 'mediator' ? -1 : b.role === 'mediator' ? 1 : ORDER.indexOf(a.role) - ORDER.indexOf(b.role),
  );
  return { ...plan, members, unfilled: unfilledOf(members) };
}

/* ---------- Execution ---------- */

/** Can this plan run? Every executable seat needs a provider, and free-only forbids paid ones. */
export function planBlockers(plan: SquadPlan): string[] {
  const issues: string[] = [];
  const runnable = plan.members.filter((m) => !NON_EXECUTABLE.includes(m.role));
  if (!runnable.length) issues.push('O squad não tem nenhum agente para executar.');
  if (!plan.members.some((m) => m.role === 'reviewer')) issues.push('O Revisor é obrigatório.');
  for (const m of runnable) {
    if (!m.provider || !m.model) issues.push(`${m.title} está sem provedor.`);
    else if (plan.freeOnly && !m.free) issues.push(`${m.title} usa provedor pago no modo só gratuito.`);
  }
  return issues;
}

/** Converts the approved squad into the ordered steps the blend runner executes. */
export function squadToSteps(plan: SquadPlan): BlendStep[] {
  return plan.members
    .filter((m): m is SquadMember & { provider: ProviderId; model: string } =>
      !NON_EXECUTABLE.includes(m.role) && !!m.provider && !!m.model)
    .map((m) => {
      const base = SQUAD_PROMPTS[m.role as keyof typeof SQUAD_PROMPTS];
      const level = m.seniority ? ` Atue com nível ${m.seniority}.` : '';
      return {
        role: m.role,
        provider: m.provider,
        model: m.model,
        label: m.seniority ? `${m.title} ${m.seniority}` : m.title,
        instruction: base + level,
      };
    });
}

/* ---------- Markdown preview ---------- */

const COMPLEXITY_LABEL: Record<Complexity, string> = { simple: 'simples', medium: 'média', complex: 'complexa' };

/** The preview the human reads (and can approve) before any agent runs. */
export function renderSquadPlanMarkdown(plan: SquadPlan): string {
  const lines: string[] = [
    '# Preview do squad',
    '',
    '## Tarefa',
    plan.task || '_(vazia)_',
    '',
    `**Complexidade estimada:** ${COMPLEXITY_LABEL[plan.complexity]} · **Modo:** ${plan.freeOnly ? 'só gratuito' : 'misto (pago permitido)'} · **Squad montado por:** ${plan.source === 'mediator' ? 'modelo mediador' : 'heurística local'}`,
    '',
    '## Equipe',
    '',
    '| # | Papel | Nível | Provedor / modelo | Custo | Por quê |',
    '|---|-------|-------|-------------------|-------|---------|',
  ];
  plan.members.forEach((m, i) => {
    const who = m.provider ? `${m.provider} / ${m.model}` : '— sem provedor —';
    lines.push(`| ${i + 1} | ${m.title} | ${m.seniority ?? '—'} | ${who} | ${m.provider ? (m.free ? 'grátis' : 'pode custar') : '—'} | ${m.why} |`);
  });
  lines.push('', '## Fluxo', '', plan.members.filter((m) => m.role !== 'mediator').map((m) => m.title).join(' → '), '');
  if (plan.note) lines.push('## Nota', '', plan.note, '');
  if (plan.unfilled.length)
    lines.push('## Atenção', '', `Sem provedor pronto para: ${plan.unfilled.map((r) => SQUAD_TITLES[r]).join(', ')}. Conecte um provedor gratuito (Gratuitos ou Ollama) ou desligue "Só gratuito".`, '');
  lines.push('> Preview gerado pelo mediador. Nenhum agente foi executado. Git e Deploy ficam com você.');
  return lines.join('\n');
}
