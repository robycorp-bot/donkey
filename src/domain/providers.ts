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
  configurationHint: string;
  documentationUrl: string;
}

/** Model IDs are editable suggestions. Availability depends on the provider account. */
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'minhavida',
    name: 'Modal minha vida',
    label: 'Modal minha vida',
    shortName: 'MV',
    description:
      'Só modelos gratuitos, de várias empresas, num chat só. Escolha o modelo na lista e bora.',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    suggestedModels: [],
    supported: true,
    configurationHint:
      'Usa os modelos gratuitos (:free) do OpenRouter. Crie uma conta grátis em openrouter.ai e cole a chave; sem crédito nenhum. Se o Boteco de IA já tiver chave, ela é reaproveitada.',
    documentationUrl: 'https://openrouter.ai/models?max_price=0',
  },
  {
    id: 'openrouter',
    name: 'Boteco de IA',
    label: 'Boteco de IA',
    shortName: 'B',
    description: 'Vários modelos, uma prosa só. Conexão direta com o OpenRouter.',
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
    description: 'Seu espaço de conversa com modelos da API OpenAI.',
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
  {
    id: 'grok',
    name: 'Grok',
    label: 'Grok',
    shortName: 'Gx',
    description: 'Espaço reservado para a integração dos modelos Grok da xAI.',
    defaultModel: 'grok-3-mini',
    suggestedModels: ['grok-3-mini', 'grok-3'],
    supported: false,
    configurationHint: 'A integração da xAI será habilitada quando o conector oficial estiver pronto.',
    documentationUrl: 'https://docs.x.ai/',
  },
];

export const providers = PROVIDERS;

export function getProvider(id: ProviderId): ProviderDefinition {
  const provider = PROVIDERS.find((item) => item.id === id);
  if (!provider) throw new Error('Provedor de IA desconhecido.');
  return provider;
}
