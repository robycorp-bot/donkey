# Copiar a base para um projeto novo

A missão desta árvore é ser **copiada**. O núcleo (`factory-ia/` + adaptadores)
vai igual. O que você preenche é `factory-ia/dominio/`.

## O que copiar

- `factory-ia/` inteiro. Pode omitir `factory-ia/dominio/exemplos/` (referência morta).
- Ponteiros da raiz: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `GROK.md`, `README.md`.
- `.cursor/rules/`, `.claude/agents/`.
- `.gitignore` da base; acrescente entradas da stack no domínio.

Não copie código de aplicação de outro produto. Não ative `factory-ia/dominio/exemplos/`
como domínio vivo.

## Primeiro dia

Siga [`dominio/CHECKLIST-PRIMEIRO-DIA.md`](dominio/CHECKLIST-PRIMEIRO-DIA.md).
Enquanto `factory-ia/dominio/MISSAO.md` tiver `[PREENCHER]`, os agentes recusam inventar produto.

## O que NÃO fazer

- Não coloque regras de negócio no núcleo de `factory-ia/` (fora de `dominio/`) nem nos adaptadores.
- Não aponte `CLAUDE.md` para um produto antigo.
- Não misture duas stacks no núcleo “por via das dúvidas”.
- Não afrouxar o "sim" do humano para push e produção.
