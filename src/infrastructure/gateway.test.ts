import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { createNativeGateway, createPreviewGateway } from './gateway';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

beforeEach(() => vi.mocked(invoke).mockReset());

describe('browser preview gateway', () => {
  it('opens nested files and saves edits only in its own session', async () => {
    const preview = createPreviewGateway();
    const workspace = await preview.openWorkspace();
    expect(preview.isPreview).toBe(true);
    const source = workspace.entries.find((entry) => entry.name === 'src')!;
    expect(source.isDirectory).toBe(true);
    const entries = await preview.listDirectory(source.path);
    const file = await preview.readFile(entries.find((entry) => entry.name === 'main.ts')!.path);
    await preview.saveFile(file.path, 'session edit', file.content);
    expect((await preview.readFile(file.path)).content).toBe('session edit');
    expect((await createPreviewGateway().readFile(file.path)).content).toBe(file.content);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('detects stale saves and refuses access outside the sample workspace', async () => {
    const preview = createPreviewGateway();
    const workspace = await preview.openWorkspace();
    const file = await preview.readFile(`${workspace.path}/README.md`);
    await preview.saveFile(file.path, 'new content', file.content);
    await expect(preview.saveFile(file.path, 'stale content', file.content)).rejects.toThrow(
      'Conflito:',
    );
    expect((await preview.readFile(file.path)).content).toBe('new content');
    await expect(preview.listDirectory('C:\\')).rejects.toThrow('prévia');
    await expect(preview.readFile('/etc/passwd')).rejects.toThrow('prévia');
  });

  it('never collects credentials or sends chat requests in the browser', async () => {
    const preview = createPreviewGateway();
    expect((await preview.getProviderStatuses()).every((status) => !status.configured)).toBe(true);
    await expect(preview.configureProvider('openai', 'secret')).rejects.toThrow(
      'aplicativo desktop',
    );
    await expect(preview.removeProvider('openai')).rejects.toThrow('aplicativo desktop');
    await expect(
      preview.chat('openai', 'model', [{ role: 'user', content: 'Oi' }]),
    ).rejects.toThrow('aplicativo desktop');
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('native gateway command contract', () => {
  it('passes the original file snapshot to optimistic conflict checks', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await createNativeGateway().saveFile('C:\\code\\main.ts', 'new', 'original');
    expect(invoke).toHaveBeenCalledWith('save_file', {
      path: 'C:\\code\\main.ts',
      content: 'new',
      originalContent: 'original',
    });
  });

  it('configures a normalized key without exposing it through another state channel', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await createNativeGateway().configureProvider('openai', '  example-key  ');
    expect(invoke).toHaveBeenCalledExactlyOnceWith('configure_provider', {
      provider: 'openai',
      apiKey: 'example-key',
    });
  });

  it('blocks sending when a different provider has a configured key', async () => {
    vi.mocked(invoke).mockResolvedValue([{ id: 'openrouter', configured: true }]);
    await expect(
      createNativeGateway().chat('openai', 'model', [{ role: 'user', content: 'Oi' }]),
    ).rejects.toThrow('Configure');
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_provider_statuses');
  });

  it('sends only the requested provider conversation using the desktop command', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce([{ id: 'anthropic', configured: true }])
      .mockResolvedValueOnce('Olá!');
    const messages = [{ role: 'user' as const, content: 'Oi' }];
    await expect(
      createNativeGateway().chat('anthropic', '  custom-model ', messages),
    ).resolves.toBe('Olá!');
    expect(invoke).toHaveBeenLastCalledWith('chat', {
      provider: 'anthropic',
      model: 'custom-model',
      messages,
    });
  });
});
