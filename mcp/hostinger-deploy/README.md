# MCP de exemplo: deploy no Hostinger (plano Single Web)

Exemplo de como seria o deploy automático **se** o projeto passar a publicar algo na hospedagem. **Nada aqui está implantado nem testado contra o Hostinger real**; é um modelo para quando você decidir configurar.

## Contexto do plano

O Single Web Hosting é hospedagem **compartilhada**: serve PHP e MySQL, sem processos persistentes (por exemplo, um servidor Node/Python contínuo) e sem acesso root. Serve bem para API em PHP + MySQL e sites estáticos. O app desktop (Tauri) não roda lá; o que iria para a hospedagem seria a API/cadastro, página do produto e distribuição do instalador. Se você tiver o plano de IA local apenas no desktop, o Hostinger fica opcional.

> **Verifique antes de implementar** no hPanel do seu plano: se há SSH, FTP/FTPS, Git (implantação por repositório), versão do PHP, limite de MySQL e de processos. Recursos variam por plano e podem mudar.

## Estratégias de deploy (da mais simples à mais robusta)

| Estratégia | Quando usar | Observação |
| --- | --- | --- |
| **Git do hPanel** (implantação do repositório) | Site/API PHP simples | Menos peças; o deploy puxa a branch configurada |
| **FTPS** | Plano sem SSH | Upload por `public_html`; controle fino por pasta |
| **SSH + rsync** | Se o plano tiver SSH | Mais rápido e atômico (troca de pasta/symlink) |

Recomendação inicial: **FTPS para um diretório de release + troca controlada**, com a versão anterior preservada para rollback.

## Ferramentas do MCP (proposta)

| Ferramenta | Tipo | Confirmação |
| --- | --- | --- |
| `deploy_plan(env, version)` | leitura: lista arquivos a enviar/remover (diff) | não |
| `deploy_status(env)` | leitura: versão atual no servidor | não |
| `deploy_staging(version, confirm)` | escrita | `confirm=true` |
| `deploy_production(version, approval_token)` | escrita | token do CTO/humano, nunca automático |
| `rollback(env, to_version, confirm)` | escrita | `confirm=true` |

Regras: dry-run por padrão; produção só com `approval_token` emitido após aprovação do CTO Agent e do humano; arquivos `.env`, `.git`, `node_modules` e `*.map` nunca sobem.

## Credenciais

Definidas por variável de ambiente (veja [`.env.example`](.env.example)). Nunca versione valores reais. Em CI, use segredos do repositório. Prefira uma conta FTP **restrita ao diretório do site**, não a conta principal do hPanel.

## Fluxo com a fábrica

```text
Git Agent (aprovado) → DevOps (artefato) → Deploy Agent
  → deploy_plan → deploy_staging → verificação → [aprovação CTO + humano] → deploy_production
```

## Como começar

1. Confirme no hPanel os recursos disponíveis e crie uma conta FTP restrita.
2. Copie `.env.example` para `.env` (ignorado pelo Git) e preencha.
3. Instale o SDK: `pip install mcp`.
4. Complete `server.example.py` (renomeie para `server.py`) e teste com `npx @modelcontextprotocol/inspector python mcp/hostinger-deploy/server.py`.
5. Passe por Security e Reviewer; registre conforme [`../README.md`](../README.md).
6. Primeiro deploy sempre em um subdomínio de staging.
