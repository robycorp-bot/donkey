# Personas do núcleo

Cada ficha é um **contrato**: missão, entrada, saída, vetos, o que não faz, como
colabora em paralelo, prompt colável. Não citam stack de produto. Stack, pastas e
regras invioláveis vêm de `factory-ia/dominio/`.

Nível de modelo: [../config/modelos.yaml](../config/modelos.yaml).
Processo: [../AGENTS.md](../AGENTS.md). Paralelo: [../PARALELO.md](../PARALELO.md).

Personas extras de um projeto: `factory-ia/dominio/personas/` + lista em `factory-ia/dominio/PERSONAS.md`.
Copie [_MODELO.md](_MODELO.md). Não acrescente persona de negócio nesta pasta.

| # | Persona | Nível | Veto | Arquivo |
|---|---|---|---|---|
| 00 | Triagem | rápido | não | [00-triagem.md](00-triagem.md) |
| 01 | CTO | profundo | sim | [01-cto.md](01-cto.md) |
| 02 | Product | padrão | não | [02-product.md](02-product.md) |
| 03 | Architect | profundo | não | [03-architect.md](03-architect.md) |
| 04 | Backend | padrão | não | [04-backend.md](04-backend.md) |
| 05 | Frontend | padrão | não | [05-frontend.md](05-frontend.md) |
| 06 | Database | profundo | não | [06-database.md](06-database.md) |
| 07 | Integration | rápido | não | [07-integration.md](07-integration.md) |
| 08 | QA | padrão | sim | [08-qa.md](08-qa.md) |
| 09 | Security | profundo | sim | [09-security.md](09-security.md) |
| 10 | DevOps | profundo | não | [10-devops.md](10-devops.md) |
| 11 | Documentation | rápido | não | [11-documentation.md](11-documentation.md) |
| 12 | Reviewer | padrão | sim | [12-reviewer.md](12-reviewer.md) |
| 13 | Git | rápido | não | [13-git.md](13-git.md) |
| 14 | Deploy | padrão | não | [14-deploy.md](14-deploy.md) |

O CTO **não** é obrigado a acionar todas. Sem UI no domínio, Frontend fica de fora.
Sem banco, Database fica de fora.

## Estrutura de cada ficha

1. Missão
2. Contrato (entrada, saída, não faz)
3. Paralelo
4. Checklist
5. Prompt de sistema (texto puro, sem sintaxe de ferramenta)
