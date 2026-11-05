"""Esqueleto de MCP para deploy no Hostinger Single Web (FTPS).

EXEMPLO: não testado contra o Hostinger real. Revise antes de usar com credenciais.
Dependência: pip install mcp
Teste:       npx @modelcontextprotocol/inspector python server.py
"""
from __future__ import annotations

import ftplib
import hmac
import os
from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("hostinger-deploy")

# Nunca enviar estes itens ao servidor.
EXCLUDED = {".env", ".git", "node_modules", ".venv", "__pycache__"}
ARTIFACT_DIR = Path(os.environ.get("DEPLOY_ARTIFACT_DIR", "dist")).resolve()


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente ausente: {name}")
    return value


def _remote_root(env: str) -> str:
    if env not in ("staging", "production"):
        raise ValueError("env deve ser 'staging' ou 'production'")
    return _env("HOSTINGER_STAGING_PATH" if env == "staging" else "HOSTINGER_PRODUCTION_PATH")


def _local_files() -> list[Path]:
    return [
        p for p in ARTIFACT_DIR.rglob("*")
        if p.is_file() and not (set(p.relative_to(ARTIFACT_DIR).parts) & EXCLUDED)
    ]


def _connect() -> ftplib.FTP_TLS:
    ftp = ftplib.FTP_TLS(_env("HOSTINGER_FTP_HOST"))
    ftp.login(_env("HOSTINGER_FTP_USER"), _env("HOSTINGER_FTP_PASSWORD"))
    ftp.prot_p()  # canal de dados criptografado
    return ftp


@mcp.tool()
def deploy_plan(env: str) -> str:
    """Lista os arquivos que seriam enviados (dry-run). Não altera nada."""
    root = _remote_root(env)
    files = _local_files()
    lines = [f"Destino: {env} ({root})", f"{len(files)} arquivo(s):"]
    lines += [f"  {p.relative_to(ARTIFACT_DIR).as_posix()}" for p in files[:200]]
    if len(files) > 200:
        lines.append(f"  ... e mais {len(files) - 200}")
    return "\n".join(lines)


@mcp.tool()
def deploy_staging(version: str, confirm: bool = False) -> str:
    """Envia o artefato para staging. Exige confirm=true."""
    if not confirm:
        return "Simulação. Reexecute com confirm=true para enviar.\n" + deploy_plan("staging")
    return _upload("staging", version)


@mcp.tool()
def deploy_production(version: str, approval_token: str) -> str:
    """Envia para produção. Exige token de aprovação do CTO/humano (DEPLOY_APPROVAL_TOKEN)."""
    expected = os.environ.get("DEPLOY_APPROVAL_TOKEN", "")
    if not expected or not hmac.compare_digest(approval_token, expected):
        return "RECUSADO: aprovação ausente ou inválida. Produção exige CTO + humano."
    return _upload("production", version)


def _upload(env: str, version: str) -> str:
    root = _remote_root(env)
    files = _local_files()
    sent = 0
    with _connect() as ftp:
        for path in files:
            rel = path.relative_to(ARTIFACT_DIR).as_posix()
            _ensure_dir(ftp, f"{root}/{Path(rel).parent.as_posix()}")
            with path.open("rb") as handle:
                ftp.storbinary(f"STOR {root}/{rel}", handle)
            sent += 1
    # TODO: gravar {root}/VERSION, manter a release anterior para rollback e verificar por HTTP.
    return f"{env}: {sent} arquivo(s) enviados (versão {version})."


def _ensure_dir(ftp: ftplib.FTP, remote: str) -> None:
    current = ""
    for part in [p for p in remote.split("/") if p and p != "."]:
        current += f"/{part}"
        try:
            ftp.mkd(current)
        except ftplib.error_perm:
            pass  # já existe


if __name__ == "__main__":
    mcp.run()  # transporte stdio
