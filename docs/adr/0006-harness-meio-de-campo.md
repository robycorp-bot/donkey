# ADR-006 — Harness como meio de campo (segurança e qualidade)

**Estado:** adotada em 2026-11-13.

## Contexto

O produto deixa de ser definido principalmente por baixo custo e passa a ser definido por **proteção de dados** e **qualidade da informação** enviada a LLMs externos (Grau 33). Desenvolvedores precisam do mesmo resultado de código, mas sem expor PII/LGPD a terceiros.

## Decisão

1. Introduzir o **Harness** como biblioteca em `packages/harness/`, com pipeline explícito: **auditar → redigir → (opcional) resumir → (opcional) sintetizar → liberar ou bloquear**.
2. Toda integração nova de chat no app deve chamar o Harness **antes** de HTTP ao provedor (integração na UI em fases).
3. Classificar provedores Anthropic, xAI, OpenRouter, etc. como **Grau 33** na documentação e na UX; exceção: processamento **apenas local** (Ollama em loopback) não é Grau 33.
4. Provedores **prioritários** para o produto: Claude, Grok e modelos disponíveis no pacote Cursor; roteamento ético permanece no domínio (`agent-blend` e evoluções).

## Alternativas consideradas

| Alternativa | Por que não |
| --- | --- |
| Confiar no “não enviar arquivo” manual | Usuário cola XML inteiro no chat; falha humana inevitável. |
| Criptografar e enviar mesmo assim | O fornecedor decripta para inferência; não resolve treinamento/log. |
| Apenas aviso legal no rodapé | Não atende fail-closed nem LGPD técnica. |

## Consequências

- Novo módulo testável isolado; depois, porta em `src/application/` para o Tauri chamar.
- UI ganhará estado **auditar solicitação** e listagem de achados (fase posterior).
- Security e QA devem tratar regressão em detectores como **alta prioridade**.
