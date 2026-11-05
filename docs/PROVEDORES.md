# Provedores, credenciais e limites

Cada espaço mantém sua própria configuração e conversa. Sem chave e modelo configurados, o envio permanece bloqueado. A presença de uma chave significa apenas que existe uma credencial cadastrada; a primeira requisição pode falhar por autenticação, modelo indisponível, limite, cobrança ou rede.

| Espaço | Integração da versão 0.1.0 | Credencial | Limite declarado |
| --- | --- | --- | --- |
| Boteco de IA | OpenRouter, `POST /api/v1/chat/completions` | Chave OpenRouter | Chat direto com o modelo escolhido; sem extensão Continue |
| Codex | OpenAI, `POST /v1/responses` | Chave OpenAI API | Espaço de assistência via API; sem runtime, ferramentas ou sessões do agente Codex |
| Claude (Anthropic) | Anthropic, `POST /v1/messages` | Chave da API Anthropic | Chat via Messages; sem aplicativo Claude ou Claude Code embutido |
| Copilot | Reservado | Ainda não solicitado pela integração | Envio indisponível até implementar e validar SDK e autenticação oficiais |

Os modelos são identificadores configuráveis e dependem do catálogo e do acesso da conta. A aplicação não garante um modelo por causa do nome do espaço. API key e assinatura de um aplicativo são mecanismos distintos; o projeto não extrai sessões do navegador nem reaproveita credenciais dos aplicativos oficiais.

## Dados e segredos

As chaves são digitadas na configuração nativa e persistidas no cofre do sistema operacional. O backend as utiliza nas requisições; a interface consulta apenas o estado de configuração. A prévia web não aceita uma chave para efetuar chamadas reais.

A mensagem enviada e o histórico daquela conversa são dados transmitidos ao provedor selecionado. O ato de abrir arquivo ou workspace não envia seu conteúdo automaticamente. A versão inicial não oferece ferramentas para o modelo ler o disco, alterar arquivos ou executar comandos. Evite colar segredos no chat; o cofre de API keys não protege texto incluído deliberadamente em uma mensagem.

Histórico e configuração de modelo mantidos em memória podem desaparecer ao fechar a aplicação. Persistência de conversas e preferências faz parte de uma etapa posterior. A exclusão de credencial deve remover o segredo do cofre e bloquear novos envios desse provedor.

## Copilot: etapa necessária

O SDK oficial admite diferentes formas de autenticação e BYOK. Isso permite estudar uma integração real, mas não libera o espaço por mera presença de uma API key. Antes da implementação, definir o caminho suportado, dependências de runtime, ciclo de credenciais, limitações da conta e comportamento das ferramentas. O produto deve explicar a capacidade implementada sem prometer paridade com o Copilot completo.

## Referências oficiais

Fontes consultadas em 2026-10-19:

- [OpenRouter: criação de chat completion e autenticação Bearer](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion).
- [OpenAI: geração de texto com a API Responses](https://developers.openai.com/api/docs/guides/text).
- [Anthropic: criação de Messages](https://platform.claude.com/docs/en/api/messages/create).
- [GitHub: autenticação do Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth).
- [GitHub: BYOK no Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/byok).

Essas páginas documentam os serviços; não são evidência de que uma requisição real foi executada por este projeto. Consulte a [validação local](VALIDACAO.md).
