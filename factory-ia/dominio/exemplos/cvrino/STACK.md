# Stack — CVRINO (exemplo)

**Tipo:** web (SPA sem framework, sem build)

**Linguagens / runtime:** PHP 8.3 (`declare(strict_types=1)`, PSR-4 `App\`), JavaScript puro, CSS.

**Onde está o código:**

| Camada | Pasta |
|---|---|
| Frontend | `gade/app/` |
| Backend | `gade/src/` |
| HTTP público | `public_html/index.php` → `App\Http\ApiKernel` |
| Banco | `gade/src/Infrastructure/*Schema.php`, `gade/bin/migrate.php` |

**Banco:** MySQL (PDO `mysql:`, `utf8mb4`). Migração idempotente via `*Schema.php`.

**UI:** HTML/CSS/JS puro. CSP estrita, sem `unsafe-inline`.

**Teste / lint:** `php -l` em todo PHP alterado. Sem suíte padrão; QA registra furo.

**Host / deploy:** Hostinger Single (Apache, cron, sem Docker). Pacote ZIP
`deploy-hostinger/pack.php` + FTP. MCP opcional em `mcp/hostinger-deploy/`.

**Limites:** ~120 s / 256 MB no front controller. Sem Node no servidor.

**Dependências:** Composer (`phpspreadsheet`, `pdfparser`); vendor de produção em
`gade/.vendor-prod/`.

**Camadas:** Kernel só roteia → Controller → Service → Repository (SQL só aqui).
