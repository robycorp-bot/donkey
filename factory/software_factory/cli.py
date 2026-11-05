from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from .config import DEFAULT_CONFIG, load_config
from .pipeline import Factory
from .runner import AutoGenRunner


def main() -> None:
    p = argparse.ArgumentParser(prog="factory", description="Virtual software factory")
    p.add_argument("request", help="Business request, e.g. 'SaaS for medical clinics'")
    p.add_argument("--config", default=str(DEFAULT_CONFIG))
    p.add_argument("--execute", action="store_true", help="allow git/deploy side effects (default: dry-run plans)")
    p.add_argument("--confirm-production", action="store_true", help="human sign-off for production deploy")
    p.add_argument("--audit-dir", default="artifacts/audit")
    a = p.parse_args()

    cfg = load_config(a.config)
    factory = Factory(cfg, AutoGenRunner(cfg), execute=a.execute,
                      production_confirmed=a.confirm_production, audit_dir=Path(a.audit_dir))
    report = asyncio.run(factory.run(a.request))
    print(f"status={report.status} blocked_by={report.blocked_by} rework_rounds={report.rework_rounds}")
    raise SystemExit(0 if report.status == "approved" else 1)


if __name__ == "__main__":
    main()
