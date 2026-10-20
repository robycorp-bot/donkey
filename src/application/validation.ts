import type { ChatMessage, ProviderId, ProviderStatus } from '../domain/models';
import { getProvider } from '../domain/providers';

export function requireSupportedProvider(provider: ProviderId): void {
  const definition = getProvider(provider);
  if (!definition.supported) throw new Error(definition.configurationHint);
}

export function normalizeApiKey(provider: ProviderId, apiKey: string): string {
  requireSupportedProvider(provider);
  const normalized = apiKey.trim();
  if (!normalized) throw new Error('Informe a chave de API para abrir essa prosa.');
  if (/\s/.test(normalized))
    throw new Error('A chave de API não pode conter espaços ou quebras de linha.');
  return normalized;
}

export function requireConfiguredProvider(provider: ProviderId, statuses: ProviderStatus[]): void {
  requireSupportedProvider(provider);
  if (!statuses.some((status) => status.id === provider && status.configured)) {
    throw new Error('Configure a chave de API deste provedor antes de conversar.');
  }
}

export function validateChatRequest(
  provider: ProviderId,
  model: string,
  messages: ChatMessage[],
): { model: string; messages: ChatMessage[] } {
  requireSupportedProvider(provider);
  const normalizedModel = model.trim();
  if (!normalizedModel) throw new Error('Informe o identificador do modelo.');
  if (!messages.length) throw new Error('Escreva uma mensagem para começar a prosa.');
  if (
    messages.some(
      (message) => !['user', 'assistant'].includes(message.role) || !message.content.trim(),
    )
  ) {
    throw new Error('A conversa contém uma mensagem vazia ou um papel inválido.');
  }
  if (messages.at(-1)?.role !== 'user') throw new Error('A última mensagem precisa ser sua.');
  // Copy the request so later UI edits cannot change the in-flight conversation.
  return { model: normalizedModel, messages: messages.map((message) => ({ ...message })) };
}
