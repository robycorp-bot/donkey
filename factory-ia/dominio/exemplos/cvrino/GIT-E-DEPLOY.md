# Git e deploy — CVRINO (exemplo)

**Branch principal:** `main`

**Nunca entra no Git:** `gade/config.local.php`, `gade/storage/*` (exceto `.htaccess`),
`gade/vendor/`, `.env`, logs, chaves, ZIPs de `deploy-hostinger/`.

**Convenção de commit:** padrão do núcleo (imperativo, pt-BR).

**Há deploy?** sim, Hostinger Single.

**Ambientes:** local (`APP_ENV` local) · homologação (subdomínio) · produção (domínio do painel).

**Roteiro de produção:**
1. Sim do CTO e do humano.
2. Backup MySQL + `gade/storage/configuration.key`.
3. `php deploy-hostinger/pack.php` e extrair no `FTP_REMOTE_ROOT` (pai de `public_html/` e `gade/`).
4. Atualizar `gade/DEPLOY_VERSION`; cron roda `gade/bin/deploy-migrate.php`.
5. `gade/bin/check-hosting.php` + fumaça (login + uma rota por módulo).

**Homologação pelo DevOps sem humano extra?** sim, após Reviewer. Produção nunca.

**Pacote nunca inclui:** `config.local.php`, `storage/**` (só `.htaccess`), `.env`,
logs, chaves, `.vendor-prod` como pasta local, `dev-scripts`, Swagger/OpenAPI local.
