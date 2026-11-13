# MCP de deploy — Hostinger Single Web Hosting (exemplo)

> Exemplo **inativo**. Não registra sozinho. Só use se o domínio vivo for este produto.
> Regras MCP do núcleo: `factory-ia/mcp/README.md`.

Servidor MCP que publica o CVRINO na Hostinger por **FTPS** (FTP sobre TLS), disponível no plano
Single Web Hosting. Usa o fluxo de deploy do **código do produto** (não desta BASE):
`gade/DEPLOY_VERSION` enviado por último; cron roda `gade/bin/deploy-migrate.php`.

**Caminho operacional no produto:** pacote ZIP via `deploy-hostinger/pack.php` (extrair no
FTP_REMOTE_ROOT). Este MCP é plano assistido com confirmação. Espelho `public_html/` + `gade/`.

## Ferramentas expostas

| Ferramenta | O que faz | Altera o servidor? |
|---|---|---|
| `plan_deploy(environment)` | Lista o que seria enviado, tamanho total e devolve `confirm_token` | não |
| `run_deploy(environment, confirm_token, version)` | Envia os arquivos do plano e grava `DEPLOY_VERSION` por último | **sim** |
| `check_health(environment)` | Chama `GET /api/health` do ambiente | não |

## Mapeamento local → servidor

| Local | Servidor |
|---|---|
| `public_html/` | `public_html/` |
| `gade/` (exceto exclusões) | `gade/` (um nível acima de `public_html`) |
| `gade/.vendor-prod/` | `gade/vendor/` |

Nunca enviados: `gade/config.local.php`, `gade/storage/**` (exceto `.htaccess`), `gade/vendor/`
local de desenvolvimento, `.git/`, `node_modules/`, `*.log`, `*.sql`, `*.bak`.

## Variáveis de ambiente

Por ambiente (`STAGING` ou `PRODUCTION`):

```text
HOSTINGER_STAGING_FTP_HOST      ex.: ftp.seudominio.com.br
HOSTINGER_STAGING_FTP_USER
HOSTINGER_STAGING_FTP_PASSWORD
HOSTINGER_STAGING_REMOTE_ROOT   pasta que contém public_html e gade (ex.: /domains/homolog.seudominio.com.br)
HOSTINGER_STAGING_BASE_URL      ex.: https://homolog.seudominio.com.br
```

Trava de produção (só o humano liga, e desliga depois):

```text
DEPLOY_ALLOW_PRODUCTION=1
```

## Uso esperado pelos agentes

1. DevOps ou Deploy Agent chama `plan_deploy("staging")` e mostra o resumo ao CTO.
2. CTO aprova; para produção, o humano também aprova e liga `DEPLOY_ALLOW_PRODUCTION`.
3. Deploy Agent chama `run_deploy` com o token e a versão (ex.: `2026.11.05-1`).
4. Deploy Agent chama `check_health` e confere `check-hosting.php` pelo terminal da Hostinger ou cron.

## Antes de usar de verdade

- Confirmar no hPanel o host e a pasta raiz do FTP da conta (a estrutura de pastas varia por conta).
- Confirmar que o cron de `deploy-migrate.php` está configurado.
- Testar primeiro em homologação.
- Considerar SFTP (biblioteca `paramiko`) se o plano oferecer SSH; o exemplo usa FTPS por ser o
  denominador comum.
- Envio é arquivo a arquivo e não remove arquivos antigos do servidor: arquivos apagados no repositório
  precisam ser removidos à mão (de propósito, nesta versão).
