# Donkey

Editor desktop **de código** (Monaco, workspace, Git, terminal, execução npm) com chat multi-provedor, pensado para **desenvolvedores**. Além de IDE leve, o núcleo estratégico é **segurança da informação** e **qualidade do que vai para LLMs de terceiros** (**Grau 33**), com meio de campo em [`packages/harness/`](packages/harness/). Visão: [`docs/VISAO.md`](docs/VISAO.md). **Dev e instalação:** [`docs/DEV.md`](docs/DEV.md).

### Comandos rápidos

| Comando | Uso |
| --- | --- |
| `npm run setup` | Primeira vez após clone |
| `npm run dev:app` | Desenvolver com hot reload |
| `npm run ship` | Compilar, instalar e abrir no Windows |
| `npm run build:app` | Só gerar instalador |

Este repositório também embute a **fábrica multiagente** (`factory-ia/`) usada para governar o próprio desenvolvimento. O domínio do Donkey está em [`factory-ia/dominio/`](factory-ia/dominio/).

## O que é / o que não é

| É | Não é |
|---|---|
| Fábrica de trabalho para Claude, Gemini, Codex, Grok e Cursor | Um painel, um SaaS, um boilerplate PHP |
| Núcleo estável + domínio por projeto | Regras de um cliente antigo (CVRINO/GADE) no núcleo |
| Elenco com contratos, vetos e "sim" do humano | Um único prompt que gera o sistema inteiro |

## Como copiar

1. Copie a árvore para o repo novo (veja `factory-ia/COPIAR.md`).
2. Abra a ferramenta na **raiz**.
3. Preencha `factory-ia/dominio/` com o checklist `factory-ia/dominio/CHECKLIST-PRIMEIRO-DIA.md`.
4. Não coloque negócio no núcleo de `factory-ia/` (fora de `dominio/`) nem nos adaptadores da raiz.

## Onde está o quê

- Núcleo: [`factory-ia/`](factory-ia/)
- Slot do projeto: [`factory-ia/dominio/`](factory-ia/dominio/)
- Exemplo preenchido (opcional, inativo): [`factory-ia/dominio/exemplos/cvrino/`](factory-ia/dominio/exemplos/cvrino/)
- Como cada LLM carrega as regras: [`factory-ia/ADAPTADORES.md`](factory-ia/ADAPTADORES.md)

## Ferramentas

Todas apontam para as **mesmas** regras. Arquivo na raiz é ponteiro, não cópia.

- Claude: `CLAUDE.md` + `.claude/agents/`
- Gemini: `GEMINI.md`
- Codex: `CODEX.md` + `AGENTS.md`
- Grok: `GROK.md` + `AGENTS.md`
- Cursor: `AGENTS.md` + `.cursor/rules/factory-ia.mdc`
