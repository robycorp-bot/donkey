# Decisões de arquitetura

## ADR-001 — Aplicativo próprio com Tauri 2

**Estado:** adotada para a base 0.1.0.

O contexto pede um editor próprio e um executável Windows. Tauri reúne interface web e backend Rust usando o WebView do sistema. Essa escolha permite concentrar no backend o acesso ao disco, a credenciais e à rede. A [arquitetura oficial do Tauri](https://v2.tauri.app/concept/architecture/) descreve a separação entre processo principal e WebView.

Um fork do VS Code ampliaria o escopo de manutenção e preservaria uma plataforma que o contexto explicitamente não busca. Electron é uma alternativa viável, mas a prioridade inicial é reaproveitar o WebView do sistema. Isso é uma decisão de projeto; consumo de memória, tamanho do instalador e desempenho ainda precisam ser medidos no aplicativo real.

**Consequências:** Rust/MSVC e WebView2 entram nos pré-requisitos Windows. Capacidades, comandos e caminhos precisam ser delimitados. A prévia no navegador não valida os adapters nativos.

## ADR-002 — Svelte 5, TypeScript e Monaco

**Estado:** adotada para a base 0.1.0.

Svelte atende à interface reativa do editor com uma estrutura pequena de componentes. TypeScript explicita os contratos entre interface, casos de uso e adapters. Monaco oferece a superfície de edição e recursos de linguagem básicos sem exigir uma plataforma inteira de IDE.

React permanece uma alternativa conhecida; não há requisito que justifique manter dois frameworks. Monaco é o editor incorporado, não um host de extensões do VS Code. LSP, depuração, terminal e suporte completo a linguagens são trabalho adicional.

**Consequências:** carregar workers e recursos Monaco via Vite; não confundir destaque de sintaxe com análise semântica ou compilação do projeto aberto. Isolar ciclo de vida e estado do Monaco do domínio.

## ADR-003 — APIs diretas e chats independentes

**Estado:** adotada para a base 0.1.0; integração Copilot adiada.

OpenRouter, OpenAI e Anthropic têm adapters próprios no backend, sem depender de extensão Continue. Cada espaço exige configuração individual e informa qual API utiliza. Chamar uma API de modelo não incorpora o produto do fornecedor nem oferece automaticamente seu agente, ferramentas ou sessão autenticada.

Copilot continua visível como reservado. O SDK oficial já existe; ainda é preciso escolher a integração, validar autenticação, dependências de runtime e distribuição antes de liberar o envio. A [documentação de autenticação do Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth) e o [fluxo BYOK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/byok) são a referência dessa decisão futura.

**Consequências:** nenhuma API key genérica libera todos os chats; comportamento indisponível fica explícito. O nome Codex designa o espaço de assistência via OpenAI nesta versão, sem anunciar execução pelo runtime Codex.

## ADR-004 — Segredos no cofre e acesso local por workspace

**Estado:** adotada para a base 0.1.0.

Chaves persistidas pertencem ao cofre do sistema operacional. Chamadas de IA são realizadas no Rust, por destinos definidos pelo adapter. Arquivos são acessíveis após seleção da raiz nativa, com validação de escopo e conflito na gravação.

**Consequências:** falha do cofre deve bloquear configuração/envio com erro claro, sem persistência alternativa em texto puro. O navegador oferece demonstração em memória e não simula conexão real de IA. Esses contratos precisam de verificação nativa e testes das regras de filesystem.

## ADR-005 — Continuar no Tauri; sem fork do VS Code

**Estado:** adotada em 2026-11-05.

O produto precisa ser extremamente leve. Um fork do Code - OSS (modelo Cursor) traria extensões e depurador prontos, mas passa de 300 MB, usa a memória de um Electron completo e exige build de horas e manutenção contínua do upstream. O app atual (Tauri + Svelte + Monaco) tem instalador de cerca de 7 MB.

Os recursos do VS Code entram aos poucos nesta base (LSP, paleta de comandos, busca no projeto, diff). A diferença do produto é o motor de agentes: provedores OpenRouter, OpenAI, Anthropic, Google, Grok e Ollama local, com um blend em etapas (planejar, codar, revisar) que prefere local e gratuito e tem modo só gratuito.

**Consequências:** extensões do VS Code não rodam aqui. Qualquer dependência nova deve justificar seu peso. Reavaliar o fork só se a compatibilidade com extensões passar a pesar mais que a leveza.

## ADR-006 — Harness meio de campo

**Estado:** adotada em 2026-11-13.

O núcleo do produto passa a ser **segurança e qualidade da informação** enviada a LLMs externos, não só leveza/custo. Decisão: biblioteca `packages/harness/` como gate (auditoria, redação, resumo local futuro, síntese estrutural) e nomenclatura **Grau 33** para provedores terceiros.

Detalhe: [`adr/0006-harness-meio-de-campo.md`](adr/0006-harness-meio-de-campo.md).

## ADR-007 — Execução delegada ao CLI local e MCP do Harness

**Estado:** adotada em 2026-11-13, escopo uso pessoal com executável não compartilhado.

O login do Google não serve de credencial comum: nessas ferramentas ele é só provedor de identidade, e quem emite a sessão é cada fornecedor. Decisão: o Donkey **nunca** reusa credencial de outro aplicativo e, no lugar disso, delega a execução ao **CLI já autenticado na máquina**, com o prompt liberado pelo `harness-gate` e o rastreio alimentado pela saída estruturada do CLI. O Harness também passa a ser servidor MCP para as demais ferramentas.

Modelo de confiança: o Donkey vê tudo porque representa o desenvolvedor; o CLI delegado é braço de empresa terceira e só alcança o projeto pelas ferramentas de workspace do MCP do Donkey, com o conteúdo já auditado. Contenção obrigatória: raiz restrita e ferramentas nativas de arquivo negadas.

Detalhe: [`adr/0007-execucao-via-cli-local.md`](adr/0007-execucao-via-cli-local.md).
