import type { FindingSeverity, SensitiveFinding, SensitiveKind } from '../types';

interface PatternRule {
  kind: SensitiveKind;
  severity: FindingSeverity;
  regex: RegExp;
}

const RULES: PatternRule[] = [
  { kind: 'cpf', severity: 'high', regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
  { kind: 'cnpj', severity: 'high', regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g },
  {
    kind: 'email',
    severity: 'medium',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    kind: 'phone_br',
    severity: 'medium',
    regex: /\(\d{2}\)\s?\d{4,5}-?\d{4}\b/g,
  },
  { kind: 'nfe_access_key', severity: 'high', regex: /\b\d{44}\b/g },
  {
    kind: 'bank_keyword',
    severity: 'high',
    regex:
      /\b(conta\s+corrente|ag[eê]ncia|pix|chave\s+pix|n[uú]mero\s+da\s+conta|iban|swift)\b/gi,
  },
];

function excerpt(text: string, start: number, end: number): string {
  const slice = text.slice(start, end);
  if (slice.length <= 48) return slice;
  return `${slice.slice(0, 24)}…${slice.slice(-12)}`;
}

function overlaps(a: SensitiveFinding, b: SensitiveFinding): boolean {
  return a.start < b.end && b.start < a.end;
}

export function detectSensitive(text: string): SensitiveFinding[] {
  const raw: SensitiveFinding[] = [];

  for (const rule of RULES) {
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      raw.push({
        kind: rule.kind,
        severity: rule.severity,
        start,
        end,
        excerpt: excerpt(text, start, end),
      });
    }
  }

  raw.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: SensitiveFinding[] = [];
  for (const finding of raw) {
    const last = merged[merged.length - 1];
    if (last && overlaps(last, finding)) {
      if (severityRank(finding.severity) > severityRank(last.severity)) {
        merged[merged.length - 1] = finding;
      }
      continue;
    }
    merged.push(finding);
  }

  return merged;
}

function severityRank(s: FindingSeverity): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}
