# Base da fábrica de software (multiagente)

Isto **não** é um produto. É a estrutura que você copia para **qualquer** projeto
novo. O artefato é o sistema operacional da equipe de IA: papéis independentes,
fluxo, paralelismo, qualidade e um slot de domínio.

Código de aplicação é output de um projeto-filho, depois que `factory-ia/dominio/` está preenchido.

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
