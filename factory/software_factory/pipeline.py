from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .config import FactoryConfig
from .governance import Verdict, parse_verdict
from .runner import Runner

DEV_STAGE = ("backend", "frontend", "database")


@dataclass
class Report:
    request: str
    status: str = "running"  # approved | rejected | running
    blocked_by: str | None = None
    rework_rounds: int = 0
    outputs: dict[str, str] = field(default_factory=dict)
    audit: list[dict] = field(default_factory=list)


class Factory:
    def __init__(self, config: FactoryConfig, runner: Runner, *, execute: bool = False,
                 production_confirmed: bool = False, audit_dir: Path | None = None):
        self.cfg, self.runner, self.policy = config, runner, config.policy
        self.execute, self.production_confirmed = execute, production_confirmed
        self.audit_dir = audit_dir

    def _context(self, report: Report) -> str:
        parts = [f"## Request\n{report.request}"]
        parts += [f"## {name} output\n{out}" for name, out in report.outputs.items()]
        return "\n\n".join(parts)

    async def _step(self, report: Report, agent: str, instruction: str = "") -> str:
        out = await self.runner.run(agent, f"{self._context(report)}\n\n## Your task\n{instruction or 'Do your role.'}")
        # Same role can appear twice (cto); keep both, keyed by step order.
        key = agent if agent not in report.outputs else f"{agent}#{len(report.audit)}"
        report.outputs[key] = out
        report.audit.append({"ts": datetime.now(timezone.utc).isoformat(), "agent": agent, "chars": len(out)})
        return out

    async def run(self, request: str) -> Report:
        report = Report(request)
        cto_runs = 0
        for stage in self.cfg.stages:
            for agent in stage:
                if agent == "cto":
                    cto_runs += 1
                    final = cto_runs > 1
                    out = await self._step(report, "cto", "Final approval. End with VERDICT." if final else "Triage and break down the work.")
                    if final and parse_verdict(out) is Verdict.REJECTED:
                        return self._finish(report, "rejected", "cto")
                elif agent in ("qa", "security", "reviewer"):
                    if not await self._gate(report, agent):
                        return self._finish(report, "rejected", agent)
                elif agent == "git":
                    self.policy.require("git", "commit")
                    await self._step(report, "git", "Plan branch, commits and PR." + ("" if self.execute else " (dry-run)"))
                elif agent == "deploy":
                    self.policy.require("deploy", "execute_deploy")
                    await self._step(report, "deploy", self._deploy_instruction())
                else:
                    await self._step(report, agent)
        return self._finish(report, "approved", None)

    def _deploy_instruction(self) -> str:
        if self.execute and self.production_confirmed:
            return "Plan deploy through staging to production."
        return "Plan deploy up to staging ONLY. Production is not authorized for this run."

    async def _gate(self, report: Report, agent: str) -> bool:
        """Run a veto agent; on rejection send feedback to developers and retry, up to the limit."""
        self.policy.require(agent, "veto")
        for attempt in range(self.cfg.max_rework_rounds + 1):
            out = await self._step(report, agent, "Review all work. End with VERDICT.")
            if parse_verdict(out) is Verdict.APPROVED:
                return True
            if attempt == self.cfg.max_rework_rounds:
                return False
            report.rework_rounds += 1
            for dev in DEV_STAGE:
                if self.policy.can(dev, "write_code") or self.policy.can(dev, "database_changes"):
                    await self._step(report, dev, f"{agent} REJECTED the change. Fix the blocking issues:\n{out}")
        return False

    def _finish(self, report: Report, status: str, blocked_by: str | None) -> Report:
        report.status, report.blocked_by = status, blocked_by
        if self.audit_dir:
            self.audit_dir.mkdir(parents=True, exist_ok=True)
            name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + ".json"
            (self.audit_dir / name).write_text(json.dumps(report.__dict__, indent=2, ensure_ascii=False), encoding="utf-8")
        return report
