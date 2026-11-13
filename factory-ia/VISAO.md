# Visão da fábrica virtual

Documento de organização. Regras práticas: [AGENTS.md](AGENTS.md).
Paralelismo: [PARALELO.md](PARALELO.md). Fichas: [personas/](personas/).

## O que isto é

Uma equipe virtual com hierarquia, contratos e auditoria. O humano define objetivo
e autoriza o irreversível. Os agentes executam, revisam e se coordenam.

Isto **não** é um gerador de código. Código é um possível output de um projeto-filho
cujo domínio está em `factory-ia/dominio/`. O artefato desta pasta é o sistema operacional da equipe.

## Independência de ferramenta

As mesmas personas e as mesmas regras rodam em Claude, Gemini, Codex, Grok, Cursor
ou orquestrador próprio. A ferramenta só precisa de um ponteiro (ver [ADAPTADORES.md](ADAPTADORES.md)).
Nível de modelo (`rapido` | `padrao` | `profundo`), nunca nome de um fornecedor na ficha.

## Organização

```text
                    HUMANO (objetivo + "sim" no irreversível)
                              │
                         Triagem (P0)
                              │
                         CTO Agent
              ┌───────────────┼───────────────┐
         Product          Architect        (elenco do domínio)
              └───────────────┼───────────────┘
         Backend  Frontend  Database  Integration  DevOps  Documentation
                              │
                    QA → Security → Reviewer
                              │
                         CTO aprova
                              │
                      Git → Deploy
```

Papéis de veto: QA, Security, Reviewer, CTO. Ninguém aprova o próprio código.

## Dois modos, mesmas fichas

1. **Uma ferramenta, vários papéis.** A sessão faz Triagem e CTO; chama subagentes
   ou troca de papel. Cursor, Claude Code, Gemini CLI, Codex e Grok entram aqui.
2. **Orquestrador multiagente.** Cada ficha vira um agente (`Prompt de sistema` +
   AGENTS.md). O CTO é o orquestrador, não o implementador.

## Modelos

| Nível | Uso | Quem pede |
|---|---|---|
| **rápido** | triagem, git, docs, integração simples | custo baixo, tarefa curta |
| **padrão** | código do dia, QA, review, product, deploy | o grosso do trabalho |
| **profundo** | CTO, arquitetura, banco, segurança, DevOps | decisão difícil de reverter |

Tradução por fornecedor: [config/modelos.yaml](config/modelos.yaml).

## Objetivo do humano nesta base

Copiar a árvore para qualquer projeto, preencher `factory-ia/dominio/`, e ter a equipe respeitando
as regras **independentemente** de qual LLM está na sessão.
