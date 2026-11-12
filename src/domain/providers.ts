import type { ProviderId } from './models';

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  label: string;
  shortName: string;
  description: string;
  defaultModel: string;
  suggestedModels: string[];
  supported: boolean;
  /** Runs on this machine: no API key and no cost. */
  local?: boolean;
  configurationHint: string;
  documentationUrl: string;
}

/** Model IDs are editable suggestions. Availability depends on the provider account. */
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'minhavida',
    name: 'Gratuitos',
    label: 'Gratuitos',
    shortName: 'Fr',
    description:
      'Só modelos gratuitos de várias empresas. Sem cartão e sem custo.',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    suggestedModels: [],
    supported: true,
    configurationHint:
      'Usa os modelos gratuitos (:free) do OpenRouter. Crie uma conta grátis em openrouter.ai e cole a chave. Se o OpenRouter já tiver chave, ela é reaproveitada.',
    documentationUrl: 'https://openrouter.ai/models?max_price=0',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    label: 'OpenRouter',
    shortName: 'B',
    description: 'Centenas de modelos com uma chave só.',
    defaultModel: 'openai/gpt-4.1-mini',
    suggestedModels: ['openai/gpt-4.1-mini', 'anthropic/claude-sonnet-5'],
    supported: true,
    configurationHint: 'Use uma chave da API do OpenRouter. O modelo pode ser editado livremente.',
    documentationUrl: 'https://openrouter.ai/docs/quickstart',
  },
  {
    id: 'openai',
    name: 'Codex',
    label: 'Codex',
    shortName: 'C',
    description: 'Modelos da OpenAI.',
    defaultModel: 'gpt-4.1-mini',
    suggestedModels: ['gpt-4.1-mini', 'gpt-4.1'],
    supported: true,
    configurationHint:
      'Use uma chave da API OpenAI. Este chat usa a API; não executa o agente Codex CLI.',
    documentationUrl: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini',
  },
  {
    id: 'anthropic',
    name: 'Claude',
    label: 'Claude',
    shortName: 'A',
    description: 'Uma conversa dedicada aos modelos da Anthropic.',
    defaultModel: 'claude-sonnet-5',
    suggestedModels: ['claude-sonnet-5'],
    supported: true,
    configurationHint: 'Use uma chave da API Anthropic. O modelo depende do acesso da sua conta.',
    documentationUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    label: 'Google Gemini',
    shortName: 'Ge',
    description: 'Modelos Gemini do Google, com camada gratuita no AI Studio.',
    defaultModel: 'gemini-2.5-flash',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    supported: true,
    configurationHint: 'Crie uma chave gratuita no Google AI Studio (começa com AIza).',
    documentationUrl: 'https://ai.google.dev/gemini-api/docs/openai',
  },
  {
    id: 'grok',
    name: 'Grok',
    label: 'Grok',
    shortName: 'Gx',
    description: 'Modelos Grok da xAI.',
    defaultModel: 'grok-3-mini',
    suggestedModels: ['grok-3-mini', 'grok-3'],
    supported: true,
    configurationHint: 'Use uma chave da API da xAI (começa com xai-).',
    documentationUrl: 'https://docs.x.ai/',
  },
  {
    id: 'ollama',
    name: 'Ollama local',
    label: 'Ollama local',
    shortName: 'Ol',
    description: 'Modelos rodando na sua máquina. Grátis, privado e sem internet.',
    defaultModel: 'qwen2.5-coder:7b',
    suggestedModels: ['qwen2.5-coder:7b', 'llama3.2:3b', 'deepseek-coder-v2:16b'],
    supported: true,
    local: true,
    configurationHint:
      'Instale o Ollama (ollama.com), baixe um modelo com "ollama pull <modelo>" e mantenha-o aberto. Não precisa de chave.',
    documentationUrl: 'https://ollama.com/library',
  },
  {
    id: 'copilot',
    name: 'Copilot',
    label: 'Copilot',
    shortName: 'G',
    description: 'Espaço reservado para uma futura integração oficial.',
    defaultModel: '',
    suggestedModels: [],
    supported: false,
    configurationHint:
      'Integração pendente do SDK oficial e do fluxo de autenticação do GitHub Copilot.',
    documentationUrl: 'https://github.com/github/copilot-sdk',
  },
];

export const providers = PROVIDERS;

export function getProvider(id: ProviderId): ProviderDefinition {
  const provider = PROVIDERS.find((item) => item.id === id);
  if (!provider) throw new Error('Provedor de IA desconhecido.');
  return provider;
}
