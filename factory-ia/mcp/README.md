# MCP — ferramentas com governança

MCP (Model Context Protocol) expõe ações repetíveis sem entregar credencial ao modelo.
Este guia é do **núcleo**. Servidores de um produto específico moram no domínio
(`factory-ia/dominio/` ou `factory-ia/dominio/exemplos/`), não aqui.

## Quando criar um servidor

- A ação se repete (deploy, backup, status).
- Há credencial que o agente não deve ver.
- Há regra de governança (aprovação, ambiente, dry-run).

## Regras de todo MCP desta fábrica

1. Credenciais só por variável de ambiente. Nunca no código, no JSON versionado, nem no log.
2. Toda ação que altera estado tem `plan_*` (dry-run + `confirm_token`) e `run_*` (só com o token).
3. Produção exige trava extra ligada pelo humano (ex.: `DEPLOY_ALLOW_PRODUCTION=1`) **e**
   o "sim" do fluxo em `AGENTS.md`.
4. Lista de exclusão de segredos é fixa no servidor, não negociável pelo prompt.
5. Retorno curto, legível pelo agente e pelo humano.
6. Sem ação destrutiva remota (`DROP`, apagar árvore) na primeira versão do servidor.

## Anatomia mínima (Python)

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("nome-do-servidor")

@mcp.tool()
def plan_algo(parametro: str) -> str:
    """Dry-run. Devolve confirm_token."""
    return "plano + token"

if __name__ == "__main__":
    mcp.run()
```

## Registro (mesmo bloco, arquivos diferentes)

| Ferramenta | Onde |
|---|---|
| Claude Code | `.mcp.json` na raiz |
| Cursor | `.cursor/mcp.json` |
| Gemini CLI | `.gemini/settings.json` |
| Outras | `command` + `args` + `env` |

Exemplo de produto (Hostinger / painel PHP) em
[`../dominio/exemplos/cvrino/mcp/`](../dominio/exemplos/cvrino/mcp/) — **não** está ativo
só por existir. Só vale se o domínio do projeto-filho o adotar.
