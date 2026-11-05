import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../domain/models';
import { normalizeApiKey, requireConfiguredProvider, validateChatRequest } from './validation';

describe('provider setup and chat validation', () => {
  it('normalizes a pasted key and rejects missing or malformed credentials', () => {
    expect(normalizeApiKey('openrouter', '  example-key\n')).toBe('example-key');
    expect(() => normalizeApiKey('openai', '  ')).toThrow('chave de API');
    expect(() => normalizeApiKey('anthropic', 'key with spaces')).toThrow('espaços');
  });

  it('keeps each provider locked until its own key is configured', () => {
    const statuses = [{ id: 'openrouter' as const, configured: true }];
    expect(() => requireConfiguredProvider('openrouter', statuses)).not.toThrow();
    expect(() => requireConfiguredProvider('openai', statuses)).toThrow('Configure');
    expect(() =>
      requireConfiguredProvider('copilot', [{ id: 'copilot', configured: true }]),
    ).toThrow('SDK oficial');
  });

  it('rejects unavailable Copilot before collecting credentials', () => {
    expect(() => normalizeApiKey('copilot', 'any-key')).toThrow('SDK oficial');
  });

  it('requires a model and a nonempty user message', () => {
    expect(() => validateChatRequest('openai', ' ', [{ role: 'user', content: 'Oi' }])).toThrow(
      'modelo',
    );
    expect(() => validateChatRequest('openai', 'model', [])).toThrow('mensagem');
    expect(() => validateChatRequest('openai', 'model', [{ role: 'user', content: '  ' }])).toThrow(
      'vazia',
    );
    expect(() =>
      validateChatRequest('openai', 'model', [{ role: 'assistant', content: 'Oi' }]),
    ).toThrow('última');
  });

  it('snapshots the current provider conversation for a request', () => {
    const original: ChatMessage[] = [{ role: 'user', content: 'Original' }];
    const request = validateChatRequest('openrouter', '  vendor/model  ', original);
    original[0].content = 'Changed';
    original.push({ role: 'assistant', content: 'New message' });
    expect(request.model).toBe('vendor/model');
    expect(request.messages).toEqual([{ role: 'user', content: 'Original' }]);
  });
});
