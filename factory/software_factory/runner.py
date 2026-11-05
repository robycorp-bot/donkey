"""Runners execute one agent turn. AutoGen is imported lazily so the rest works without it."""
from __future__ import annotations

from typing import Protocol

from .config import FactoryConfig


class Runner(Protocol):
    async def run(self, agent: str, task: str) -> str: ...


def _model_client(cfg: dict[str, str]):
    if cfg["provider"] == "anthropic":
        from autogen_ext.models.anthropic import AnthropicChatCompletionClient

        return AnthropicChatCompletionClient(model=cfg["id"])
    if cfg["provider"] == "openai":
        from autogen_ext.models.openai import OpenAIChatCompletionClient

        return OpenAIChatCompletionClient(model=cfg["id"])
    raise ValueError(f"unknown provider: {cfg['provider']}")


class AutoGenRunner:
    """One AssistantAgent per role, created on first use. Needs ANTHROPIC_API_KEY / OPENAI_API_KEY."""

    def __init__(self, config: FactoryConfig):
        self.config = config
        self._agents: dict[str, object] = {}

    def _agent(self, name: str):
        if name not in self._agents:
            from autogen_agentchat.agents import AssistantAgent

            spec = self.config.agents[name]
            self._agents[name] = AssistantAgent(
                name=name,
                model_client=_model_client(self.config.models[spec.model_alias]),
                system_message=spec.prompt,
            )
        return self._agents[name]

    async def run(self, agent: str, task: str) -> str:
        result = await self._agent(agent).run(task=task)  # type: ignore[attr-defined]
        return str(result.messages[-1].content)
