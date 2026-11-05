# Histórico de versões

O projeto usa versões `MAJOR.MINOR.PATCH`. Durante `0.x`, os contratos e formatos locais ainda podem mudar. A versão deve permanecer alinhada em `package.json`, no manifesto Cargo e na configuração do Tauri.

## Não lançado

- TDD em todas as camadas (ver `docs/TESTES.md`): 141 testes de interface (regras, stores, componentes, App em modo navegador e instalado), 44 testes Rust e 5 testes ponta a ponta com Monaco real. Cobertura mínima de 85% exigida no CI, mais clippy e e2e.
- Corrigido: o terminal e a Central de IA podiam ficar travados em "executando" se a rolagem automática falhasse.
- Removido o modal de Git antigo (`GitPanel.svelte`), substituído pelo painel lateral.
- Central de IA no centro: chat grande com provedores, modelo, preço por 1M tokens, custo/tokens/latência por resposta, anexar o arquivo aberto como contexto (opcional), copiar e inserir código no cursor.
- Monitor de IA na direita: gasto hoje/30 dias/total, limite diário (bloqueia modelos pagos ao atingir), gasto de 14 dias, consumo por modelo, histórico de requisições e linha do tempo de ações (arquivos, Git, terminal, IA). Guarda só metadados, nunca prompts nem chaves.
- Backend devolve uso real de tokens; OpenRouter informa o custo real e OpenAI/Anthropic são estimados pelo catálogo público de preços.
- Live Server no topo: serve o HTML aberto (ou index.html) e recarrega a página a cada salvamento.
- Janela translúcida com Mica (Windows 11) e degradê; visual opcional "terminal antigo" (fósforo verde) no rodapé.
- Segurança das chaves: validação do prefixo por provedor antes de guardar (impede mandar a chave de um provedor para outro), exibição apenas mascarada (…1234), respostas da IA renderizadas só como texto.
- Barra Git no topo: branch, alterações, ↑/↓ commits, Pull, Push e Sincronizar.
- Painel Git na lateral (aba ao lado de Arquivos): diff por arquivo, preparar tudo, commit, commit e enviar, branches e vínculo do remoto origin (GitHub).
- Terminal integrado (Ctrl `) que executa comandos na pasta do projeto, com histórico e atalhos de Git/npm.
- Painéis laterais redimensionáveis por arraste (duplo clique restaura), Ctrl B esconde a lateral, botão para recolher pastas e recarregar a árvore.
- Formatação embutida com Prettier (Shift Alt F) e formatar ao salvar ligado por padrão: JS, TS, JSON, CSS/SCSS/Less, HTML, Vue, Svelte, Markdown e YAML.
- Chat "Modal minha vida": somente modelos gratuitos (`:free`) do OpenRouter, lista ao vivo agrupada por empresa; reaproveita a chave do Boteco de IA.

## 0.2.0 — 2026-10-19

- Instalador NSIS por usuário para testes pessoais no Windows.
- Git local: índice por arquivo, commit, branches, fetch, pull fast-forward e push para origin com autenticação do Git existente.
- Servidor HTML restrito à pasta aberta e loopback; prévia incorporada e abertura no navegador.
- Scripts npm, instalação explícita de dependências, logs limitados e parada de processos gerenciados.
- Abertura da pasta por argumento de linha de comando; atualização da árvore após operações Git que alteram o projeto.
- Bloqueio de troca/atualização com edições pendentes; operações Git não publicam o repositório automaticamente.

## 0.1.0 — 2026-10-19

Primeira base de desenvolvimento; não constitui uma release publicada ou um instalador homologado.

### Escopo da entrega

- Estrutura própria com Tauri 2, Svelte 5, TypeScript, Rust e Monaco.
- Direção visual inspirada no macOS: controles de janela próprios, painéis arredondados, navegação compacta e remoção da barra de atividades lateral.
- Preservação de desfazer, cursor e rolagem entre abas; proteção de alterações pendentes e de arquivos UTF-8 com BOM.
- Workspace nativo, edição UTF-8 e salvamento com detecção de conflito.
- Chats separados para OpenRouter/Boteco de IA, OpenAI Responses/Codex e Anthropic Messages, com credenciais no cofre do sistema operacional.
- Espaço Copilot reservado e demonstração web com arquivos em memória.
- Documentação de DDD, decisões, roadmap e processo de build; CI Windows para frontend e backend.

As verificações efetivamente executadas e as limitações estão em [`docs/VALIDACAO.md`](docs/VALIDACAO.md). Integrações planejadas não são apresentadas como recursos prontos.
