# Adaptadores — a mesma fábrica em cada ferramenta

O conteúdo canônico é `factory-ia/` (processo) + `factory-ia/dominio/` (produto). Cada ferramenta só tem um ponteiro
na raiz. Abra sempre a **raiz do repositório**.

## Tabela

| Ferramenta | Ponteiro automático | Subagentes | Nível de modelo |
|---|---|---|---|
| **Claude Code** | `CLAUDE.md` → `@factory-ia/AGENTS.md` | `.claude/agents/` (um por persona) | coluna `claude` |
| **Gemini CLI** | `GEMINI.md` → `@factory-ia/AGENTS.md` | se não houver, troque de papel | coluna `gemini` |
| **OpenAI Codex** | `CODEX.md` + `AGENTS.md` da raiz | conforme o produto; senão troque de papel | coluna `openai` |
| **Grok / xAI** | `GROK.md` + `AGENTS.md` da raiz | troque de papel | coluna `grok` |
| **Cursor** | `AGENTS.md` + `.cursor/rules/factory-ia.mdc` | Task/subagentes apontam às fichas | coluna `cursor` |
| **Outra / API** | cole o bloco da seção “Sem ponteiro” | um agente por ficha | a coluna do fornecedor |

Nenhum adaptador carrega stack de produto. Stack está em `factory-ia/dominio/STACK.md`.

## Claude Code

- `CLAUDE.md` importa o núcleo. Subagentes em `.claude/agents/` só apontam à ficha.
- Modelo do frontmatter = nível da persona (`haiku` / `sonnet` / `opus`).
- Papéis de veto: ferramentas só de leitura (+ shell de inspeção, sem escrita).

## Gemini CLI

- `GEMINI.md` importa o núcleo.
- Sem subagente nativo: “Atue como `factory-ia/personas/09-security.md`”.
- Modelo: coluna `gemini` de `config/modelos.yaml`.

## OpenAI Codex

- Lê `AGENTS.md` da raiz (e `CODEX.md` quando o produto o carregar).
- Siga o fluxo Triagem → CTO → elenco. Não crie regras dentro de `.codex/` além de ponteiro.

## Grok / xAI

- Lê `AGENTS.md` da raiz. `GROK.md` reforça a mesma ordem de leitura.
- Coluna `grok` em `config/modelos.yaml`.

## Cursor

- `AGENTS.md` da raiz + regra always-on `.cursor/rules/factory-ia.mdc`.
- Ao usar Task/subagente, a descrição deve apontar à ficha, **não** copiar o prompt.
- Selecione o modelo do nível do papel que está exercendo.

## Sem ponteiro (cole no início da sessão)

```text
Leia factory-ia/AGENTS.md e siga. Depois leia factory-ia/dominio/MISSAO.md, factory-ia/dominio/STACK.md
e factory-ia/dominio/REGRAS.md; se tiverem [PREENCHER], você está na BASE da fábrica:
não invente produto. Atue primeiro como factory-ia/personas/00-triagem.md.
```

## AutoGen / API

- `system_message` = “Prompt de sistema” da ficha + AGENTS.md (se o agente alterar o repo).
- Modelo: `personas.<id>` → nível → `niveis.<nível>.<fornecedor>`.
- Triagem no nível `rapido` com `triagem.limite_segundos`; estourou, sobe ao CTO.

## Como adicionar outra ferramenta

1. Crie um arquivo curto na raiz (`FERRAMENTA.md` ou o nome que ela lê sozinha).
2. Faça-o apontar para `factory-ia/AGENTS.md` e `factory-ia/dominio/`.
3. Acrescente uma coluna em `config/modelos.yaml` se o fornecedor for novo.
4. Documente uma linha nesta tabela. **Não** copie personas para a pasta da ferramenta.
