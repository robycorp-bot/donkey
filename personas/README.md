# Personas

Cada agente da Software Factory tem um arquivo próprio com papel, especialidades, responsabilidades, limites e exemplos. O formato é estável de propósito: serve de prompt de sistema, de contrato de governança e de base para fine-tuning (cada seção "Exemplos" pode virar pares prompt/resposta).

## Índice

| Persona | Arquivo | Veto | Escreve código |
| --- | --- | --- | --- |
| CTO | [cto.md](cto.md) | override | não |
| Product Manager | [product.md](product.md) | não | não |
| Architect | [architect.md](architect.md) | não | não |
| Backend | [backend.md](backend.md) | não | sim |
| Frontend | [frontend.md](frontend.md) | não | sim |
| Database | [database.md](database.md) | não | migrações |
| Integration | [integration.md](integration.md) | não | sim |
| QA | [qa.md](qa.md) | sim | testes |
| Security | [security.md](security.md) | sim | não |
| DevOps | [devops.md](devops.md) | não | infra |
| Documentation | [documentation.md](documentation.md) | não | docs |
| Reviewer | [reviewer.md](reviewer.md) | sim | não |
| Git | [git.md](git.md) | não | não |
| Deploy | [deploy.md](deploy.md) | não | não |

## Como manter

- Novo agente: copie [`_TEMPLATE.md`](_TEMPLATE.md), preencha, adicione ao índice e ao `factory/config/agents.yaml`.
- Mudou permissão ou modelo: atualize o `.md` e o YAML juntos; o YAML é o que roda.
- Exemplos devem ser reais e curtos. Remova os que ficarem obsoletos.
- Todas as personas herdam as regras de [`AGENTS.md`](../AGENTS.md).

## Contexto do projeto (comum a todas)

App desktop **Tauri 2 + Svelte 5 + TypeScript + Rust**, DDD em camadas, IA local/gratuita no núcleo, foco em performance, integridade e leveza. Veja [`docs/ARQUITETURA.md`](../docs/ARQUITETURA.md).
