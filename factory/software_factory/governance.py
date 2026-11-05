"""Deterministic governance. Rules live in code, never in an LLM prompt."""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

VETO_STAGES = ("qa", "security", "reviewer")


class Verdict(str, Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


_VERDICT_RE = re.compile(r"VERDICT:\s*(APPROVED|REJECTED)", re.IGNORECASE)


def parse_verdict(text: str) -> Verdict:
    """Last `VERDICT:` marker wins. Missing or ambiguous output is REJECTED (fail closed)."""
    matches = _VERDICT_RE.findall(text or "")
    if not matches:
        return Verdict.REJECTED
    return Verdict(matches[-1].upper())


class PermissionDenied(Exception):
    pass


@dataclass(frozen=True)
class Policy:
    permissions: dict[str, dict[str, bool]]

    def can(self, agent: str, action: str) -> bool:
        return bool(self.permissions.get(agent, {}).get(action, False))

    def require(self, agent: str, action: str) -> None:
        if not self.can(agent, action):
            raise PermissionDenied(f"{agent} is not allowed to {action}")

    def vetoers(self) -> list[str]:
        return [a for a in self.permissions if self.can(a, "veto")]


def production_deploy_allowed(cto_verdict: Verdict, human_confirmed: bool) -> bool:
    """Production needs CTO approval AND an explicit human confirmation flag."""
    return cto_verdict is Verdict.APPROVED and human_confirmed
