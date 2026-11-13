export type SensitiveKind =
  | 'cpf'
  | 'cnpj'
  | 'email'
  | 'phone_br'
  | 'nfe_access_key'
  | 'bank_keyword';

export type FindingSeverity = 'low' | 'medium' | 'high';

export interface SensitiveFinding {
  kind: SensitiveKind;
  severity: FindingSeverity;
  start: number;
  end: number;
  excerpt: string;
}

export type HarnessVerdict = 'safe' | 'needs_review' | 'blocked';

export interface HarnessInput {
  text: string;
  /** Contexto para mensagens futuras e políticas. */
  purpose?: 'chat' | 'blend' | 'export';
  /** Se true, high severity vira blocked em vez de needs_review. */
  strict?: boolean;
}

export interface HarnessOutput {
  verdict: HarnessVerdict;
  findings: SensitiveFinding[];
  safeText: string;
  userMessage: string;
  /** Quantos caracteres foram redigidos. */
  redactedCount: number;
}
