from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .governance import Policy

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config" / "agents.yaml"


@dataclass(frozen=True)
class AgentSpec:
    name: str
    model_alias: str
    prompt: str
    permissions: dict[str, bool] = field(default_factory=dict)


@dataclass(frozen=True)
class FactoryConfig:
    models: dict[str, dict[str, str]]
    agents: dict[str, AgentSpec]
    stages: list[list[str]]
    max_rework_rounds: int

    @property
    def policy(self) -> Policy:
        return Policy({n: a.permissions for n, a in self.agents.items()})


def load_config(path: Path | str = DEFAULT_CONFIG) -> FactoryConfig:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    agents = {
        name: AgentSpec(name, a["model"], " ".join(a["prompt"].split()), a.get("permissions") or {})
        for name, a in raw["agents"].items()
    }
    stages = raw["workflow"]["stages"]
    for stage in stages:
        for name in stage:
            if name not in agents:
                raise ValueError(f"workflow references unknown agent: {name}")
    for a in agents.values():
        if a.model_alias not in raw["models"]:
            raise ValueError(f"{a.name}: unknown model alias {a.model_alias}")
    return FactoryConfig(raw["models"], agents, stages, int(raw["workflow"].get("max_rework_rounds", 2)))
