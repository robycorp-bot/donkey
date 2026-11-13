import { describe, expect, it, vi } from 'vitest';
import { findingLabel, inspectOutbound, isGrau33 } from './harness-gate';

describe('harness-gate · perímetro', () => {
  it('trata provedor remoto como Grau 33 e o Ollama local como perímetro', () => {
    expect(isGrau33('anthropic')).toBe(true);
    expect(isGrau33('grok')).toBe(true);
    expect(isGrau33('ollama')).toBe(false);
  });

  it('considera Grau 33 um provedor desconhecido (fail-closed)', () => {
    expect(isGrau33('inexistente' as never)).toBe(true);
  });
});

describe('harness-gate · veredito', () => {
  it('libera texto sem achados sem alterar o conteúdo', () => {
    const decision = inspectOutbound('Explique este parser de XML.', 'anthropic');
    expect(decision.verdict).toBe('safe');
    expect(decision.allowed).toBe(true);
    expect(decision.redacted).toBe(false);
    expect(decision.textToSend).toBe('Explique este parser de XML.');
  });

  it('barra CPF e só oferece a versão redigida', () => {
    const decision = inspectOutbound('O titular 123.456.789-09 reclamou.', 'grok');
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe('blocked');
    expect(decision.textToSend).toContain('[REDACTED:cpf]');
    expect(decision.textToSend).not.toContain('123.456.789-09');
    expect(decision.message).not.toBe('');
    expect(decision.outcome?.findings.some((f) => f.kind === 'cpf')).toBe(true);
  });

  it('não audita destino local: o texto segue íntegro', () => {
    const decision = inspectOutbound('O titular 123.456.789-09 reclamou.', 'ollama');
    expect(decision.grau33).toBe(false);
    expect(decision.allowed).toBe(true);
    expect(decision.textToSend).toContain('123.456.789-09');
    expect(decision.outcome).toBeNull();
  });

  it('bloqueia quando o próprio Harness falha', async () => {
    vi.resetModules();
    vi.doMock('@donkey/harness', async (original) => ({
      ...(await original<typeof import('@donkey/harness')>()),
      runHarness: () => {
        throw new Error('detector quebrado');
      },
    }));
    const { inspectOutbound: gate } = await import('./harness-gate');
    const decision = gate('texto qualquer', 'anthropic');
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe('blocked');
    expect(decision.textToSend).toBe('');
    vi.doUnmock('@donkey/harness');
    vi.resetModules();
  });

  it('dá nome em português a cada tipo de achado', () => {
    expect(findingLabel('cpf')).toBe('CPF');
    expect(findingLabel('bank_keyword')).toBe('Dado bancário');
    expect(findingLabel('desconhecido')).toBe('desconhecido');
  });
});
