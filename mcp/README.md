# MCP — orientação

[MCP (Model Context Protocol)](https://modelcontextprotocol.io) permite que modelos chamem ferramentas externas por um contrato padrão. Neste projeto, cada MCP é um **servidor pequeno, com poucas ferramentas e permissões explícitas**.

## Estrutura

```text
mcp/
├── README.md                  ← este guia
├── TEMPLATE.md                ← ficha para documentar um novo MCP
└── hostinger-deploy/          ← exemplo: deploy no Hostinger Single Web
    ├── README.md
    ├── mcp.example.json       ← como registrar o servidor no cliente
    ├── server.example.py      ← esqueleto do servidor (Python)
    └── .env.example           ← variáveis (sem valores reais)
```

Cada novo MCP ganha sua pasta `mcp/<nome>/` com README, exemplo de registro e `.env.example`.

## Princípios

1. **Mínimo privilégio:** exponha só as ferramentas necessárias; separe leitura de escrita.
2. **Segredos fora do repositório:** variáveis de ambiente ou cofre do SO. Só `.env.example` é versionado.
3. **Ações destrutivas ou de produção exigem confirmação:** a ferramenta recebe um parâmetro explícito de aprovação e recusa sem ele. A decisão é do CTO Agent e do humano (veja [`personas/deploy.md`](../personas/deploy.md)).
4. **Dry-run por padrão:** ferramentas de escrita simulam e mostram o plano; só executam com `confirm=true`.
5. **Saídas limitadas e sem segredos:** truncar logs; nunca devolver credenciais.
6. **Auditável:** registrar cada chamada (ferramenta, ambiente, versão, resultado) sem dados sensíveis.
7. **Leve:** processo local via `stdio`, sem daemon permanente.

## Como criar um MCP

1. Preencha [`TEMPLATE.md`](TEMPLATE.md): objetivo, ferramentas, entradas/saídas, permissões, riscos.
2. Crie `mcp/<nome>/` e implemente o servidor (SDK oficial: `mcp` para Python, `@modelcontextprotocol/sdk` para TypeScript).
3. Escreva `mcp.example.json` e `.env.example`.
4. Teste localmente com o MCP Inspector (`npx @modelcontextprotocol/inspector`) antes de registrar em um cliente.
5. Passe pelo Security Agent e pelo Reviewer antes de usar com credenciais reais.
6. Registre no cliente (Claude Code: `claude mcp add`, ou `.mcp.json` na raiz do projeto, sem segredos).

## Registro no Claude Code

```powershell
claude mcp add hostinger-deploy --scope project -- python mcp/hostinger-deploy/server.py
```

O `--scope project` grava em `.mcp.json`; as credenciais vêm do ambiente, não do arquivo.
