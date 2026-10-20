# Arquitetura e limites DDD

O produto é um aplicativo local. A interface Svelte usa contratos TypeScript; os recursos nativos passam pela ponte Tauri; Rust concentra filesystem, credenciais e rede. Monaco é um adapter de edição, sem responsabilidade sobre autorização de arquivos ou chamadas aos provedores.

## Contextos

| Contexto | Responsabilidade | Invariantes |
| --- | --- | --- |
| Workspace | Pasta selecionada, navegação e referências a arquivos | Caminhos devem permanecer dentro da raiz autorizada; leitura de texto aceita UTF-8 |
| Editor | Documentos abertos, conteúdo, alteração local e salvamento | Conteúdo alterado permanece sinalizado; conflito externo não é sobrescrito silenciosamente |
| Assistência de IA | Provedor, configuração e conversa | Chave/modelo de um provedor não liberam outro; envio exige configuração e capacidade implementada |
| Credenciais | Referência e ciclo de vida de segredos | Segredo persistido no cofre nativo, sem retorno da chave para preencher a interface |
| Shell | Layout, tema, atalhos e mensagens ao usuário | A interface reflete capacidades reais e identifica o modo de demonstração |

Workspace e Editor colaboram por referências e snapshots de arquivos. Assistência de IA recebe somente o conteúdo definido para a solicitação; abrir uma pasta não concede ao modelo acesso automático a ela. Os adapters não decidem regras de domínio.

## Camadas

1. **Domínio:** tipos, estados e regras, sem importar Svelte, APIs Tauri ou cliente HTTP.
2. **Aplicação:** casos de uso como abrir workspace, abrir documento, salvar, configurar provedor e enviar mensagem; dependem de portas.
3. **Infraestrutura:** implementação das portas por Tauri/Rust, cofre do sistema, filesystem e APIs externas. O modo web usa adapters em memória.
4. **Apresentação:** componentes Svelte, Monaco e estilos; chama casos de uso e apresenta resultados.

Os nomes e diretórios do código podem evoluir sem alterar estes limites. Evitar entidades e serviços genéricos apenas para preencher camadas: cada abstração deve proteger uma regra ou substituir uma dependência externa.

## Fronteira nativa

O backend mantém a raiz selecionada pelo diálogo nativo. Requisições de leitura e escrita validam o caminho fornecido e o destino resolvido. Travessia de diretórios e links simbólicos ou junções são rejeitados. A interface web não recebe uma API de acesso irrestrito ao disco.

O salvamento compara a versão lida com a versão atual no disco antes de gravar. A garantia é detectar alterações observadas nessa verificação; não substitui bloqueio de filesystem, monitoramento contínuo ou controle de versão. Arquivos binários, codificações diferentes de UTF-8 e arquivos acima de 2 MiB são rejeitados com motivo explícito. Criar, renomear e excluir arquivos ainda não fazem parte deste fluxo.

O backend lê a chave do cofre somente para a chamada ao provedor. O frontend recebe presença/configuração e o resultado da solicitação. Falhas não devem devolver cabeçalhos de autorização ou corpo bruto que possa conter segredos. Modelo e texto são dados de entrada; não habilitam execução de comandos.

## Evolução

Git e execução usam contratos separados em `domain/workspace-tools.ts` e o adapter `infrastructure/workspace-tools.ts`. Os comandos nativos passam pelo workspace selecionado. `infrastructure/git.rs` executa argumentos Git fixos, com pathspecs literais, autenticação do Git existente e sem shell livre. `infrastructure/project.rs` mantém uma execução gerenciada, logs limitados e servidor HTTP estático em loopback. A janela encerra a execução ao fechar; trocar de pasta encerra a execução anterior.

Contêineres, terminal interativo e agentes continuam separados. Antes de dar ferramentas a um modelo, definir seleção de contexto, permissões, revisão de alterações, cancelamento, limites de custo e registro das ações. Os novos comandos não estão disponíveis aos chats de IA.
