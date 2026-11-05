import type { GitState } from '../domain/workspace-tools';
import type { AiRequest } from '../domain/ai-metrics';

export function gitState(over: Partial<GitState> = {}): GitState {
  return {
    available: true,
    repository: true,
    branch: 'main',
    branches: ['main', 'dev'],
    changes: [],
    commits: [{ hash: 'abc123', subject: 'Primeiro commit' }],
    remote: true,
    remoteUrl: 'https://github.com/eu/projeto.git',
    ahead: 0,
    behind: 0,
    ...over,
  };
}

export function aiRequest(over: Partial<AiRequest> = {}): AiRequest {
  return {
    id: crypto.randomUUID(),
    time: Date.now(),
    provider: 'openai',
    model: 'gpt-4.1-mini',
    status: 'ok',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
    estimated: false,
    latencyMs: 1000,
    ...over,
  };
}
