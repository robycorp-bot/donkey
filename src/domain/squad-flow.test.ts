import { describe, expect, it } from 'vitest';
import {
  addMember,
  buildSquadPlan,
  mediateSquad,
  parseMediatorReply,
  planBlockers,
  removeMember,
  squadToSteps,
  updateMember,
} from './squad-plan';

const ready = (...ids: string[]) => ids.map((id) => ({ id, configured: true })) as never;
const reply = (text: string) => ({ text, model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1 });
const GOOD =
  '```json\n{"complexity":"complex","seats":[{"role":"backend","seniority":"senior","why":"api"},{"role":"tester","why":"t"}]}\n```';

describe('parseMediatorReply', () => {
  it('lê JSON dentro de cerca de código e força o revisor', () => {
    const parsed = parseMediatorReply(GOOD)!;
    expect(parsed.complexity).toBe('complex');
    expect(parsed.seats.map((s) => s.role)).toEqual(['backend', 'tester', 'reviewer']);
  });
  it('rejeita lixo, papéis inventados e squad sem quem execute', () => {
    expect(parseMediatorReply('oi')).toBeNull();
    expect(parseMediatorReply('{"seats":[{"role":"po"},{"role":"magico"}]}')).toBeNull();
  });
});

describe('mediateSquad', () => {
  it('usa o modelo mediador quando responde certo', async () => {
    const plan = await mediateSquad('criar api', ready('ollama', 'minhavida'), async () => reply(GOOD));
    expect(plan.source).toBe('mediator');
    expect(plan.members.map((m) => m.role)).toEqual(['mediator', 'backend', 'tester', 'reviewer', 'git']);
  });
  it('cai na heurística se o modelo falha ou responde fora do formato', async () => {
    const boom = await mediateSquad('criar api', ready('ollama'), async () => {
      throw new Error('offline');
    });
    expect(boom.source).toBe('heuristic');
    expect(boom.note).toContain('offline');
    const junk = await mediateSquad('criar api', ready('ollama'), async () => reply('não sei'));
    expect(junk.source).toBe('heuristic');
  });
});

describe('edição e execução', () => {
  const base = buildSquadPlan('criar login', ready('ollama', 'minhavida'), { freeOnly: true });
  it('não remove mediador nem revisor', () => {
    const reviewer = base.members.findIndex((m) => m.role === 'reviewer');
    expect(removeMember(base, reviewer)).toBe(base);
    expect(removeMember(base, 0)).toBe(base);
    expect(removeMember(base, 1).members).toHaveLength(base.members.length - 1);
  });
  it('modo só gratuito recusa provedor pago', () => {
    expect(updateMember(base, 1, { provider: 'anthropic' })).toBe(base);
  });
  it('adicionar papel preenche provedor', () => {
    const qa = base.members.findIndex((m) => m.role === 'qa');
    const plan = addMember(removeMember(base, qa), 'qa', ready('ollama'));
    expect(plan.members.some((m) => m.role === 'qa' && m.provider)).toBe(true);
  });
  it('squadToSteps pula mediador e git e leva a instrução do papel', () => {
    const steps = squadToSteps(base);
    expect(steps.some((s) => s.role === 'mediator' || s.role === 'git')).toBe(false);
    expect(steps.every((s) => s.instruction && s.label)).toBe(true);
  });
  it('planBlockers acusa seat sem provedor', () => {
    const empty = buildSquadPlan('criar login', ready('anthropic'), { freeOnly: true });
    expect(planBlockers(empty).length).toBeGreaterThan(0);
  });
});
