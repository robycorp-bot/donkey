# factory-ia/dominio/ — slot do projeto

Único lugar que **deve** mudar quando você copia a fábrica para um repositório novo.
Enquanto estes arquivos tiverem `[PREENCHER]`, os agentes tratam o repo como BASE:
não inventam produto e não geram código de aplicação.

Não copie `exemplos/` para cá e chame de preenchido. Exemplos são referência morta.

## O que o projeto-filho DEVE preencher

| Arquivo | Para quê |
|---|---|
| [MISSAO.md](MISSAO.md) | o que o produto é / não é, usuários, fora de escopo |
| [STACK.md](STACK.md) | linguagens, pastas, como testar, limites de runtime |
| [REGRAS.md](REGRAS.md) | invioláveis de negócio e de engenharia deste produto |
| [GLOSSARIO.md](GLOSSARIO.md) | termos que o agente não pode inventar |
| [GIT-E-DEPLOY.md](GIT-E-DEPLOY.md) | branch, o que não vai ao Git, roteiro de publish |
| [PERSONAS.md](PERSONAS.md) | elenco extra (ou “nenhuma”) |
| [CHECKLIST-PRIMEIRO-DIA.md](CHECKLIST-PRIMEIRO-DIA.md) | ritual de cópia |

Opcional: `personas/` (fichas extras), `skills/` (negócio), ADRs em `docs/adr/`
na raiz do projeto (não aqui).

## Relação com o núcleo

Processo → o restante de `factory-ia/`. Produto → aqui. O domínio aperta governança;
não afrouxa push, produção nem segredos.
