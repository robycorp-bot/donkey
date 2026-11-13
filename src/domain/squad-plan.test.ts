import { describe, expect, it } from 'vitest';
import { buildSquadPlan, chooseSeats, classifyComplexity, renderSquadPlanMarkdown } from './squad-plan';

const ready = (...ids: string[]) => ids.map((id) => ({ id, configured: true })) as never;

describe('classifyComplexity', () => {
  it('classifica por palavras-chave e tamanho', () => {
    expect(classifyComplexity('trocar a cor do botão')).toBe('simple');
    expect(classifyComplexity('criar um CRUD de clientes')).toBe('medium');
    expect(classifyComplexity('migração de autenticação para OAuth')).toBe('complex');
  });
});

describe('chooseSeats', () => {
  it('tarefa de login pede backend, segurança, tester e revisor', () => {
    const roles = chooseSeats('criar login com JWT', 'complex').map((s) => s.role);
    expect(roles).toEqual(expect.arrayContaining(['po', 'tech-lead', 'architect', 'backend', 'security', 'tester', 'reviewer', 'git']));
  });
  it('senioridade acompanha a complexidade', () => {
    expect(chooseSeats('x', 'simple').find((s) => s.role === 'backend')?.seniority).toBe('junior');
    expect(chooseSeats('x', 'complex').find((s) => s.role === 'backend')?.seniority).toBe('senior');
  });
  it('tela adiciona frontend; banco adiciona database', () => {
    const roles = chooseSeats('tela com tabela no mysql', 'medium').map((s) => s.role);
    expect(roles).toEqual(expect.arrayContaining(['frontend', 'database']));
  });
});

describe('buildSquadPlan', () => {
  it('modo só gratuito nunca escolhe provedor pago', () => {
    const plan = buildSquadPlan('criar login', ready('anthropic', 'ollama', 'minhavida'), { freeOnly: true });
    expect(plan.members.every((m) => m.free)).toBe(true);
    expect(plan.unfilled).toEqual([]);
  });
  it('o mediador sempre abre o squad', () => {
    expect(buildSquadPlan('qualquer coisa', ready('ollama')).members[0].role).toBe('mediator');
  });
  it('sem provedor, lista papéis não preenchidos', () => {
    const plan = buildSquadPlan('criar login', ready('anthropic'), { freeOnly: true });
    expect(plan.unfilled.length).toBe(plan.members.length);
  });
});

describe('renderSquadPlanMarkdown', () => {
  it('gera o MD com tabela, fluxo e aviso de que nada executou', () => {
    const md = renderSquadPlanMarkdown(buildSquadPlan('criar login', ready('ollama', 'minhavida')));
    expect(md).toContain('# Preview do squad');
    expect(md).toContain('| Papel |');
    expect(md).toContain('## Fluxo');
    expect(md).toContain('Nenhum agente foi executado');
  });
});
