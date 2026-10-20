export type ProviderId = 'minhavida' | 'openrouter' | 'openai' | 'anthropic' | 'copilot' | 'grok';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface Workspace {
  name: string;
  path: string;
  entries: FileEntry[];
}

export interface FileDocument {
  path: string;
  name: string;
  content: string;
  language: string;
}

export interface DocumentTab extends FileDocument {
  /** The last confirmed disk contents, used for dirty state and conflict checks. */
  savedContent: string;
}

export interface ProviderStatus {
  id: ProviderId;
  configured: boolean;
  /** Masked fingerprint such as "…a1b2". The key itself never reaches the UI. */
  hint?: string | null;
}

export interface ChatReply {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Real cost reported by the provider; null means the UI estimates it. */
  costUsd: number | null;
  latencyMs: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppGateway {
  readonly isPreview: boolean;
  openWorkspace(): Promise<Workspace>;
  listDirectory(path: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<FileDocument>;
  saveFile(path: string, content: string, originalContent: string): Promise<void>;
  getProviderStatuses(): Promise<ProviderStatus[]>;
  configureProvider(provider: ProviderId, apiKey: string): Promise<void>;
  removeProvider(provider: ProviderId): Promise<void>;
  chat(provider: ProviderId, model: string, messages: ChatMessage[]): Promise<ChatReply>;
}
