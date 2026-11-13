"""MCP de deploy do CVRINO na Hostinger Single Web Hosting (EXEMPLO).

Fluxo: plan_deploy (dry-run, devolve confirm_token) -> run_deploy (exige o token) -> check_health.
Credenciais vêm só de variáveis de ambiente; veja README.md nesta pasta.
"""
from __future__ import annotations

import fnmatch
import hashlib
import io
import json
import os
import re
import time
import urllib.request
from dataclasses import dataclass
from ftplib import FTP_TLS, error_perm
from pathlib import Path

from mcp.server.fastmcp import FastMCP

PROJECT_ROOT = Path(
    os.environ.get("PROJECT_ROOT")
    or os.environ.get("CVRINO_PROJECT_ROOT")
    or Path(__file__).resolve().parents[5]
).resolve()
ENVIRONMENTS = ("staging", "production")
TOKEN_TTL_SECONDS = 15 * 60
VERSION_PATTERN = re.compile(r"\A[A-Za-z0-9._-]{1,64}\Z")  # mesmo formato aceito por bin/deploy-migrate.php

# (pasta local, pasta remota). gade/.vendor-prod vira gade/vendor no servidor.
SOURCES = (
    ("public_html", "public_html"),
    ("gade/.vendor-prod", "gade/vendor"),
    ("gade", "gade"),
)

# Caminhos relativos à raiz do projeto, no formato com "/".
EXCLUDE = (
    ".git/*", "*/.git/*", "*/node_modules/*",
    "gade/config.local.php",
    "gade/storage/*",
    "gade/vendor/*",          # vendor local de desenvolvimento
    "gade/.vendor-prod/*",    # enviado pela entrada própria em SOURCES
    "gade/DEPLOY_VERSION",    # gerado pelo run_deploy, sempre por último
    "*.log", "*.sql", "*.bak", "*.old", "*.orig", "*.swp", "*~",
)
ALWAYS_INCLUDE = ("gade/storage/.htaccess",)

mcp = FastMCP("cvrino-hostinger-deploy")
_plans: dict[str, tuple[float, str, str]] = {}  # token -> (criado_em, ambiente, digest)


@dataclass(frozen=True)
class PlannedFile:
    local: Path
    remote: str
    size: int
    mtime_ns: int


def _excluded(relative: str) -> bool:
    if relative in ALWAYS_INCLUDE:
        return False
    return any(fnmatch.fnmatch(relative, pattern) for pattern in EXCLUDE)


def _collect() -> list[PlannedFile]:
    files: list[PlannedFile] = []
    for local_dir, remote_dir in SOURCES:
        base = PROJECT_ROOT / local_dir
        if not base.is_dir():
            continue
        is_vendor = local_dir == "gade/.vendor-prod"
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(PROJECT_ROOT).as_posix()
            if not is_vendor and _excluded(relative):
                continue
            inner = path.relative_to(base).as_posix()
            stat = path.stat()
            files.append(PlannedFile(path, f"{remote_dir}/{inner}", stat.st_size, stat.st_mtime_ns))
    return files


def _digest(environment: str, files: list[PlannedFile]) -> str:
    payload = json.dumps([environment, [(f.remote, f.size, f.mtime_ns) for f in files]])
    return hashlib.sha256(payload.encode()).hexdigest()


def _env(environment: str, key: str) -> str:
    value = os.environ.get(f"HOSTINGER_{environment.upper()}_{key}", "").strip()
    if not value:
        raise ValueError(f"Variável HOSTINGER_{environment.upper()}_{key} não definida.")
    return value


def _check_environment(environment: str) -> str:
    environment = environment.strip().lower()
    if environment not in ENVIRONMENTS:
        raise ValueError(f"Ambiente inválido. Use um destes: {', '.join(ENVIRONMENTS)}.")
    return environment


def _ensure_remote_dir(ftp: FTP_TLS, remote_root: str, directory: str, created: set[str]) -> None:
    current = remote_root.rstrip("/")
    for part in [p for p in directory.split("/") if p]:
        current = f"{current}/{part}"
        if current in created:
            continue
        try:
            ftp.mkd(current)
        except error_perm as error:  # 550 = já existe
            if not str(error).startswith("550"):
                raise
        created.add(current)


@mcp.tool()
def plan_deploy(environment: str) -> str:
    """Simula o deploy (não envia nada). Mostra quantos arquivos e bytes iriam ao ambiente
    ('staging' ou 'production') e devolve o confirm_token exigido por run_deploy."""
    environment = _check_environment(environment)
    files = _collect()
    if not files:
        return f"Nenhum arquivo encontrado em {PROJECT_ROOT}."
    token = hashlib.sha256(os.urandom(32)).hexdigest()[:16]
    _plans[token] = (time.time(), environment, _digest(environment, files))
    total = sum(f.size for f in files)
    by_root: dict[str, int] = {}
    for f in files:
        root = "/".join(f.remote.split("/")[:2])
        by_root[root] = by_root.get(root, 0) + 1
    lines = [f"Plano de deploy para {environment.upper()}",
             f"Arquivos: {len(files)} ({total / 1_048_576:.1f} MB)"]
    lines += [f"  {root}: {count}" for root, count in sorted(by_root.items())]
    lines += ["Excluídos sempre: config.local.php, storage/, vendor local, logs.",
              f"confirm_token: {token} (válido por {TOKEN_TTL_SECONDS // 60} min)"]
    if environment == "production":
        lines.append("PRODUÇÃO: exige aprovação do CTO Agent, do humano e DEPLOY_ALLOW_PRODUCTION=1.")
    return "\n".join(lines)


@mcp.tool()
def run_deploy(environment: str, confirm_token: str, version: str) -> str:
    """Envia por FTPS os arquivos do plano aprovado e grava gade/DEPLOY_VERSION por último,
    o que dispara a migração pelo cron (bin/deploy-migrate.php). Exige o confirm_token de plan_deploy."""
    environment = _check_environment(environment)
    if not VERSION_PATTERN.match(version):
        raise ValueError("Versão inválida: use até 64 caracteres entre letras, números, ponto, hífen e sublinhado.")
    plan = _plans.pop(confirm_token, None)
    if plan is None or time.time() - plan[0] > TOKEN_TTL_SECONDS or plan[1] != environment:
        raise ValueError("confirm_token inválido, expirado ou de outro ambiente. Rode plan_deploy de novo.")
    if environment == "production" and os.environ.get("DEPLOY_ALLOW_PRODUCTION") != "1":
        raise PermissionError("Deploy em produção bloqueado: o humano precisa definir DEPLOY_ALLOW_PRODUCTION=1.")
    files = _collect()
    if _digest(environment, files) != plan[2]:
        raise ValueError("Os arquivos mudaram desde o plano. Rode plan_deploy de novo.")

    remote_root = _env(environment, "REMOTE_ROOT")
    ftp = FTP_TLS(_env(environment, "FTP_HOST"), timeout=60)
    sent = 0
    try:
        ftp.login(_env(environment, "FTP_USER"), _env(environment, "FTP_PASSWORD"))
        ftp.prot_p()  # canal de dados também cifrado
        created: set[str] = set()
        for f in files:
            _ensure_remote_dir(ftp, remote_root, f.remote.rsplit("/", 1)[0], created)
            with f.local.open("rb") as handle:
                ftp.storbinary(f"STOR {remote_root.rstrip('/')}/{f.remote}", handle)
            sent += 1
        ftp.storbinary(f"STOR {remote_root.rstrip('/')}/gade/DEPLOY_VERSION", io.BytesIO(f"{version}\n".encode()))
    except Exception as error:
        return f"Deploy INTERROMPIDO após {sent}/{len(files)} arquivos: {type(error).__name__}. DEPLOY_VERSION não foi atualizado."
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()
    return (f"Deploy {version} enviado para {environment.upper()}: {sent} arquivos. "
            "A migração roda no próximo ciclo do cron. Chame check_health em seguida.")


@mcp.tool()
def check_health(environment: str) -> str:
    """Consulta GET /api/health do ambiente e informa se o painel respondeu."""
    environment = _check_environment(environment)
    base_url = _env(environment, "BASE_URL").rstrip("/")
    if not base_url.startswith("https://"):
        raise ValueError("BASE_URL precisa começar com https://.")
    request = urllib.request.Request(f"{base_url}/api/health", headers={"User-Agent": "cvrino-deploy-mcp"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read(2048).decode("utf-8", "replace")
            return f"{environment.upper()}: HTTP {response.status} {body}"
    except Exception as error:
        return f"{environment.upper()}: sem resposta saudável ({type(error).__name__})."


if __name__ == "__main__":
    mcp.run()
