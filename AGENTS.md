# AGENTS.md

Guia para qualquer agente de IA (Claude Code, Codex, modelos locais via Ollama etc.) que trabalhe neste repositório. A visão completa da organização está em [`CLAUDE.md`](CLAUDE.md); aqui fica o que é operacional.

## O projeto

**Coder mega-brain** — editor/IDE pessoal para desenvolvimento com IA. Prioridades inegociáveis: **performance, integridade e leveza**. Núcleo com IAs locais e gratuitas (Ollama); provedores pagos (Claude, Codex, Grok, Google) são integrações opcionais. A ferramenta deve ser honesta sobre o que é gratuito e o que é pago.

| Parte | Local | Stack |
| --- | --- | --- |
| App desktop | `src/`, `src-tauri/` | Tauri 2, Svelte 5, TypeScript, Monaco, Rust |
| Fábrica de agentes | `factory/` | Python, AutoGen, `config/agents.yaml` |
| Documentação | `docs/` | Markdown (pt-BR) |
| Personas (governança de IA) | `personas/` | Um `.md` por agente |
| Orientação de MCP | `mcp/` | Guia, template e exemplo Hostinger |
| Contexto original | `struct/context-all-md` | Somente leitura |

## Arquitetura (resumo)

Camadas em `src/`: `domain` → `application` → `infrastructure` → `presentation`. Domínio não importa Svelte, Tauri nem HTTP. Rust concentra filesystem, credenciais e rede. Detalhes em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Comandos

```powershell
npm ci                 # dependências
npm run dev            # prévia web
npm run desktop:dev    # app nativo
npm run check          # tipos/Svelte
npm test               # testes de interface/domínio
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Fábrica (`factory/`): `python -m venv .venv`, `pip install -e .[dev]`, `pytest`, CLI `factory`.

## Fluxo e governança

```text
Humano → CTO → Product → Architect → Backend+Frontend+Database
       → Integration → QA → Security → Reviewer → CTO → Git → Deploy
```

- QA, Security e Reviewer têm **veto**. Nada vai ao Git sem aprovação do Reviewer.
- Deploy em produção exige aprovação do CTO Agent e, por fim, do humano.
- O CTO não escreve código operacional. Desenvolvedores não aprovam o próprio trabalho.
- Cada persona está definida em [`personas/`](personas/README.md); seus limites valem mesmo quando um único modelo assume vários papéis.

## Regras para qualquer agente

1. Leia o código e a doc relevantes antes de alterar; mantenha mudanças pequenas e focadas.
2. Respeite as camadas DDD e a fronteira nativa (caminhos validados, sem shell livre, sem chaves no frontend).
3. Segredos só no cofre do SO ou em variáveis de ambiente; nunca em código, logs, commits ou prompts. `.env` está no `.gitignore`.
4. Não anuncie recurso como pronto sem teste e validação; registre pendências em `docs/VALIDACAO.md`.
5. Não use ações irreversíveis (push forçado, deploy, exclusão em massa) sem aprovação explícita.
6. Documentação e mensagens ao usuário em português; identificadores de código em inglês.
7. Mudanças relevantes entram no `CHANGELOG.md`; decisões de arquitetura, em `docs/DECISOES.md`.

## Modelos

A fonte de verdade em execução é [`factory/config/agents.yaml`](factory/config/agents.yaml) (aliases lógicos → modelos concretos). A tabela de modelos em `CLAUDE.md` é a intenção de design; ao divergir, ajuste o YAML. Preferir modelos locais/gratuitos onde a qualidade bastar e sinalizar custo quando um modelo pago for usado.
