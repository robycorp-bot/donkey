import type { SensitiveFinding } from '../types';

export function redactText(text: string, findings: SensitiveFinding[]): { text: string; count: number } {
  if (findings.length === 0) {
    return { text, count: 0 };
  }

  const ordered = [...findings].sort((a, b) => b.start - a.start);
  let out = text;
  let count = 0;

  for (const f of ordered) {
    const token = `[REDACTED:${f.kind}]`;
    out = out.slice(0, f.start) + token + out.slice(f.end);
    count += 1;
  }

  return { text: out, count };
}
