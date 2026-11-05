import { describe, it, expect } from 'vitest';
import { localPreviewUrl, isStaged, isUnstaged } from './workspace-tools';
describe('prévia e alterações', () => {
  it('permite apenas servidores locais sem credenciais', () => {
    expect(localPreviewUrl('http://localhost:5173')).toBe('http://localhost:5173/');
    for (const url of [
      'https://github.com',
      'http://localhost.evil.test',
      'file:///C:/',
      'http://key@127.0.0.1',
    ])
      expect(() => localPreviewUrl(url)).toThrow();
  });
  it('mantém arquivo parcialmente preparado nos dois grupos', () => {
    const change = { path: 'arquivo.ts', previousPath: null, index: 'M', worktree: 'M' };
    expect(isStaged(change)).toBe(true);
    expect(isUnstaged(change)).toBe(true);
    expect(isStaged({ ...change, index: '?' })).toBe(false);
  });
});
