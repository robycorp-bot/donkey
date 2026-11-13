import type { HarnessVerdict } from './types';

export const GRAU_33_LABEL = 'Grau 33';

/** Chaveado pelo veredito para que `MESSAGES[verdict]` nunca caia em `undefined`. */
export const MESSAGES: Record<HarnessVerdict, string> = {
  safe: 'Carga liberada para o Grau 33 — nada grave detectado nesta passagem.',
  needs_review:
    'Auditar solicitação: achamos sinais de dado sensível. Revise o texto redigido antes de infiltrar no Grau 33.',
  blocked:
    'Envio barrado. O Grau 33 não recebe isso até você remover ou autorizar com consciência (auditar solicitação).',
};

export function messageFor(verdict: HarnessVerdict): string {
  return MESSAGES[verdict] ?? MESSAGES.blocked;
}
