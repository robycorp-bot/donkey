import { detectSensitive } from './detectors/sensitive';
import { MESSAGES } from './grau33';
import { redactText } from './pipeline/redact';
import { summarizeLocally } from './pipeline/summarize';
import type { HarnessInput, HarnessOutput, HarnessVerdict } from './types';

function resolveVerdict(
  findings: { severity: string }[],
  strict: boolean,
): HarnessVerdict {
  const hasHigh = findings.some((f) => f.severity === 'high');
  const hasMedium = findings.some((f) => f.severity === 'medium');

  if (findings.length === 0) return 'safe';
  if (hasHigh && strict) return 'blocked';
  if (hasHigh || hasMedium) return 'needs_review';
  return 'needs_review';
}

export function runHarness(input: HarnessInput): HarnessOutput {
  const strict = input.strict ?? true;
  const findings = detectSensitive(input.text);
  const { text: redacted, count } = redactText(input.text, findings);
  const safeText = summarizeLocally(redacted);
  const verdict = resolveVerdict(findings, strict);

  return {
    verdict,
    findings,
    safeText,
    userMessage: MESSAGES[verdict],
    redactedCount: count,
  };
}
