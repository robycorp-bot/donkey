import { describe, expect, it } from 'vitest';
import { runHarness } from './runHarness';

describe('runHarness', () => {
  it('marca safe quando não há padrões sensíveis', () => {
    const result = runHarness({ text: 'Explique como parsear XML sem dados pessoais.' });
    expect(result.verdict).toBe('safe');
    expect(result.findings).toHaveLength(0);
    expect(result.safeText).toContain('XML');
  });

  it('redige CPF e exige revisão ou bloqueio', () => {
    const result = runHarness({
      text: 'O titular 123.456.789-09 pediu o relatório.',
      strict: true,
    });
    expect(result.findings.some((f) => f.kind === 'cpf')).toBe(true);
    expect(result.safeText).toContain('[REDACTED:cpf]');
    expect(['needs_review', 'blocked']).toContain(result.verdict);
  });

  it('detecta palavra-chave bancária', () => {
    const result = runHarness({ text: 'Envie a chave PIX do cliente.' });
    expect(result.findings.some((f) => f.kind === 'bank_keyword')).toBe(true);
  });
});
