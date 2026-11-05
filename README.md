# Coder mega-brain

Editor pessoal para uso diário, com visual escuro inspirado no macOS e chats de IA separados por provedor. Painéis suaves, barra de ferramentas compacta e controles de janela próprios substituem a direção retrô inicial, conforme a revisão visual solicitada. A base usa **Tauri 2, Svelte 5, TypeScript, Monaco e Rust**. O contexto original está em [`struct/context-all-md`](struct/context-all-md).

**Versão pessoal 0.2.0 para testes.** O [guia de primeiro teste](docs/PRIMEIRO_TESTE.md) mostra instalação, Git e execução. Resultados e pendências ficam em [`docs/VALIDACAO.md`](docs/VALIDACAO.md).

## Primeira entrega

- Selecionar uma pasta pelo diálogo nativo, explorar arquivos e editar texto UTF-8 de até 2 MiB no Monaco.
- Ler e salvar dentro da pasta selecionada, com detecção de alteração externa antes de gravar.
- Manter chats e configuração independentes para Boteco de IA, Codex e Anthropic; bloquear o envio até configurar o respectivo provedor.
- Guardar chaves no cofre de credenciais do sistema operacional e executar chamadas HTTP no backend Rust.
- Exibir Copilot como integração reservada, ainda indisponível.
- Preparar/retirar arquivos do índice, criar commits, criar/trocar branches, buscar, atualizar e enviar para origin pelo Git local.
- Executar scripts npm e instalar dependências com logs e parada do processo.
- Servir HTML estático em loopback e incorporar a prévia local ou abri-la no navegador.
- Gerar instalador NSIS para o usuário atual do Windows.

Boteco de IA usa a API do OpenRouter. O espaço Codex usa a API Responses da OpenAI, e Claude (Anthropic) usa a API Messages. São chats próprios: o runtime do agente Codex, o aplicativo Claude e o ambiente completo do Copilot não estão embutidos. Veja [`docs/PROVEDORES.md`](docs/PROVEDORES.md).

No navegador, a aplicação oferece uma demonstração com arquivos em memória. Git e execução precisam do aplicativo instalado. Docker, terminal interativo completo, Ollama e agentes com ferramentas permanecem no [roadmap](docs/ROADMAP.md).

## Desenvolvimento

Instale Node.js 22 com npm. Para o aplicativo Windows, instale também Rust com a toolchain MSVC, Microsoft C++ Build Tools com a carga **Desenvolvimento para desktop com C++** e Microsoft Edge WebView2. Consulte os [pré-requisitos oficiais do Tauri](https://v2.tauri.app/start/prerequisites/).

Na raiz do repositório:

```powershell
npm ci
npm run dev
```

`npm ci` usa o arquivo de lock; `npm install` é a alternativa para atualizar dependências intencionalmente. `npm run dev` abre somente a prévia web no endereço mostrado pelo Vite.

Para executar o app nativo:

```powershell
npm run desktop:dev
```

Na versão nativa, abra uma pasta pelo botão da interface. Configure cada chat com uma chave da API correspondente e um identificador de modelo disponível para sua conta. A cobrança e a disponibilidade dependem do provedor. Nenhum arquivo é enviado automaticamente pelo simples ato de abri-lo no editor.

## Verificação e build

```powershell
npm run check
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo check --manifest-path src-tauri/Cargo.toml --bins
npm run desktop:build
```

`npm run build` gera a interface web em `dist/`. `npm run desktop:build` compila o executável Windows em `src-tauri/target/release/` e tem empacotamento NSIS habilitado, com ícone próprio. O instalador foi gerado e testado nesta máquina; uma imagem Windows limpa ainda não foi homologada. Os pacotes ficam em `src-tauri/target/release/bundle/`. Consulte a [documentação de distribuição Windows do Tauri](https://v2.tauri.app/distribute/windows-installer/).

O primeiro executável de desenvolvimento pode ser gerado com `npm run tauri -- build --debug --no-bundle` e fica em `src-tauri/target/debug/coder-mega-brain.exe`. Esse artefato valida a compilação nativa e não representa uma versão de produção homologada.

O workflow de CI verifica a interface e o código Rust no Windows. Ele não publica releases nem comprova que uma chave real ou um instalador foi testado.

## Documentação

- [Análise do contexto e escopo](docs/ESCOPO.md)
- [Arquitetura e limites DDD](docs/ARQUITETURA.md)
- [Decisões de arquitetura](docs/DECISOES.md)
- [Provedores, credenciais e limites](docs/PROVEDORES.md)
- [Roadmap](docs/ROADMAP.md)
- [Validação e pendências](docs/VALIDACAO.md)
- [Histórico de versões](CHANGELOG.md)

O projeto é destinado ao uso pessoal descrito no contexto. Esta entrega não atribui uma licença de distribuição ao projeto.
