import { messageFor, runHarness, type HarnessOutput, type HarnessVerdict } from '@donkey/harness';
import type { ProviderId } from '../domain/models';
import { getProvider } from '../domain/providers';

/**
 * Porta do Harness para o aplicativo (ADR-006).
 *
 * Nada sai para um provedor Grau 33 sem passar por aqui. Em dúvida, barra:
 * falha do Harness vira `blocked`, nunca liberação silenciosa.
 */

export const HARNESS_FAILURE_MESSAGE =
  'Auditoria do Harness falhou. Por segurança o envio foi barrado — tente de novo ou reduza o texto.';

export interface OutboundDecision {
  /** O destino está fora do perímetro local. */
  grau33: boolean;
  verdict: HarnessVerdict;
  /** Resultado da auditoria; nulo quando o destino é local e não há auditoria. */
  outcome: HarnessOutput | null;
  /** Pode seguir sem perguntar nada ao humano. */
  allowed: boolean;
  /** O que de fato deve ir ao provedor quando o envio for liberado. */
  textToSend: string;
  /** O texto liberado difere do original (trechos redigidos). */
  redacted: boolean;
  message: string;
}

/** Processamento só local (Ollama em loopback) não é Grau 33. Provedor desconhecido é. */
export function isGrau33(provider: ProviderId): boolean {
  try {
    return !getProvider(provider).local;
  } catch {
    return true;
  }
}

export function inspectOutbound(
  text: string,
  provider: ProviderId,
  purpose: 'chat' | 'blend' | 'export' = 'chat',
): OutboundDecision {
  if (!isGrau33(provider)) {
    return {
      grau33: false,
      verdict: 'safe',
      outcome: null,
      allowed: true,
      textToSend: text,
      redacted: false,
      message: '',
    };
  }

  let outcome: HarnessOutput;
  try {
    outcome = runHarness({ text, purpose, strict: true });
  } catch {
    return {
      grau33: true,
      verdict: 'blocked',
      outcome: null,
      allowed: false,
      textToSend: '',
      redacted: false,
      message: HARNESS_FAILURE_MESSAGE,
    };
  }

  const message = outcome.userMessage || messageFor(outcome.verdict);

  if (outcome.verdict === 'safe') {
    // Sem achados: o texto do humano segue íntegro, sem degradar a entrega.
    return {
      grau33: true,
      verdict: 'safe',
      outcome,
      allowed: true,
      textToSend: text,
      redacted: false,
      message,
    };
  }

  // needs_review e blocked só saem depois de "auditar solicitação", e só redigidos.
  return {
    grau33: true,
    verdict: outcome.verdict,
    outcome,
    allowed: false,
    textToSend: outcome.safeText,
    redacted: true,
    message,
  };
}

/** Rótulo curto de um achado, para a lista de auditoria. */
export const FINDING_LABELS: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone_br: 'Telefone',
  nfe_access_key: 'Chave de acesso NF-e',
  bank_keyword: 'Dado bancário',
};

export function findingLabel(kind: string): string {
  return FINDING_LABELS[kind] ?? kind;
}
