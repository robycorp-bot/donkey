import { describe, expect, it } from 'vitest';
import { PROVIDERS, getProvider } from './providers';

describe('provedores', () => {
  it('Modal minha vida vem primeiro e só usa modelos gratuitos', () => {
    expect(PROVIDERS[0].id).toBe('minhavida');
    expect(getProvider('minhavida').defaultModel.endsWith(':free')).toBe(true);
  });
  it('ids são únicos e todos os suportados têm modelo padrão', () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS.filter((p) => p.supported)) expect(p.defaultModel).not.toBe('');
    expect(getProvider('copilot').supported).toBe(false);
  });
  it('rejeita provedor desconhecido', () => {
    expect(() => getProvider('x' as never)).toThrow('desconhecido');
  });
});
