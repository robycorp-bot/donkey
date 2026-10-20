import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  AppGateway,
  ChatMessage,
  ChatReply,
  FileDocument,
  FileEntry,
  ProviderId,
  ProviderStatus,
  Workspace,
} from '../domain/models';
import { PROVIDERS } from '../domain/providers';
import {
  normalizeApiKey,
  requireConfiguredProvider,
  requireSupportedProvider,
  validateChatRequest,
} from '../application/validation';
import { languageFromPath } from '../domain/documents';

export const PREVIEW_NOTICE =
  'Prévia no navegador: abra o aplicativo desktop para usar pastas reais e configurar os chats de IA.';

export function createNativeGateway(): AppGateway {
  return {
    isPreview: false,
    openWorkspace: () => invoke<Workspace>('open_workspace'),
    listDirectory: (path) => invoke<FileEntry[]>('list_directory', { path }),
    readFile: (path) => invoke<FileDocument>('read_file', { path }),
    saveFile: (path, content, originalContent) =>
      invoke<void>('save_file', { path, content, originalContent }),
    getProviderStatuses: () => invoke<ProviderStatus[]>('get_provider_statuses'),
    async configureProvider(provider, apiKey) {
      return invoke<void>('configure_provider', {
        provider,
        apiKey: normalizeApiKey(provider, apiKey),
      });
    },
    async removeProvider(provider) {
      requireSupportedProvider(provider);
      return invoke<void>('remove_provider', { provider });
    },
    async chat(provider: ProviderId, model: string, messages: ChatMessage[]) {
      const request = validateChatRequest(provider, model, messages);
      const statuses = await invoke<ProviderStatus[]>('get_provider_statuses');
      requireConfiguredProvider(provider, statuses);
      return invoke<ChatReply>('chat', { provider, ...request });
    },
  };
}

const PREVIEW_ROOT = '/preview/coder-mega-brain';

/** A session-only sandbox: no filesystem, network, persistent storage, or credentials. */
export function createPreviewGateway(): AppGateway {
  const files = new Map<string, string>([
    [
      `${PREVIEW_ROOT}/README.md`,
      '# Coder mega-brain\n\nUm editor de outro tempo. Um motor de agora.\n\nEsta é uma prévia interativa no navegador. Abra um arquivo, edite e salve à vontade. As alterações duram somente nesta sessão.\n\nNo aplicativo desktop, abra uma pasta real e configure uma chave de API para conversar com seus modelos.\n',
    ],
    [
      `${PREVIEW_ROOT}/src/main.ts`,
      `// Coder mega-brain · um editor com personalidade\n\ninterface Companheiro {\n  nome: string;\n  pronto: boolean;\n}\n\nconst boteco: Companheiro = {\n  nome: 'Boteco de IA',\n  pronto: false, // Configure sua chave no aplicativo desktop.\n};\n\nfunction abrirProsa(companheiro: Companheiro): string {\n  if (!companheiro.pronto) {\n    return 'Oxente, configure a chave primeiro!';\n  }\n\n  return 'Puxe uma cadeira. Bora construir coisa boa.';\n}\n\nconsole.log(abrirProsa(boteco));\n`,
    ],
    [
      `${PREVIEW_ROOT}/src/styles.css`,
      ':root {\n  color-scheme: dark;\n  --noite: #101411;\n  --fosforo: #b9d68b;\n  --ambar: #d6b979;\n}\n\nbody {\n  margin: 0;\n  background: var(--noite);\n  color: var(--fosforo);\n  font-family: monospace;\n}\n',
    ],
    [
      `${PREVIEW_ROOT}/package.json`,
      '{\n  "name": "coder-mega-brain",\n  "private": true,\n  "description": "Prévia de um editor com alma retrô"\n}\n',
    ],
  ]);
  const directories = new Set([PREVIEW_ROOT, `${PREVIEW_ROOT}/src`]);

  function list(path: string): FileEntry[] {
    if (!directories.has(path)) throw new Error('Pasta indisponível nesta prévia.');
    const prefix = `${path}/`;
    return [...directories, ...files.keys()]
      .filter(
        (candidate) =>
          candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes('/'),
      )
      .map((candidate) => ({
        name: candidate.slice(prefix.length),
        path: candidate,
        isDirectory: directories.has(candidate),
      }))
      .sort(
        (a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name),
      );
  }

  const unavailable = async (): Promise<never> => {
    throw new Error(PREVIEW_NOTICE);
  };

  return {
    isPreview: true,
    async openWorkspace() {
      return { name: 'coder-mega-brain', path: PREVIEW_ROOT, entries: list(PREVIEW_ROOT) };
    },
    async listDirectory(path) {
      return list(path);
    },
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) throw new Error('Arquivo indisponível nesta prévia.');
      return { path, name: path.split('/').pop()!, content, language: languageFromPath(path) };
    },
    async saveFile(path, content, originalContent) {
      const current = files.get(path);
      if (current === undefined) throw new Error('Arquivo indisponível nesta prévia.');
      if (current !== originalContent)
        throw new Error('Conflito: este arquivo mudou desde a leitura. Reabra-o antes de salvar.');
      files.set(path, content);
    },
    async getProviderStatuses() {
      return PROVIDERS.map(({ id }) => ({ id, configured: false }));
    },
    configureProvider: unavailable,
    removeProvider: unavailable,
    chat: unavailable,
  };
}

export const gateway: AppGateway = isTauri() ? createNativeGateway() : createPreviewGateway();
export const appGateway = gateway;
