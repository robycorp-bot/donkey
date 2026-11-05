from software_factory import Factory, load_config
from software_factory.governance import PermissionDenied, Verdict, parse_verdict
import pytest


class FakeRunner:
    def __init__(self, verdicts: dict[str, list[str]]):
        self.verdicts, self.calls = verdicts, []

    async def run(self, agent, task):
        self.calls.append(agent)
        queue = self.verdicts.get(agent)
        if queue:
            return f"text\nVERDICT: {queue.pop(0)}"
        return "ok"


def test_parse_verdict_fails_closed():
    assert parse_verdict("") is Verdict.REJECTED
    assert parse_verdict("looks fine to me") is Verdict.REJECTED
    assert parse_verdict("VERDICT: REJECTED\n...\nVERDICT: APPROVED") is Verdict.APPROVED


def test_config_policy():
    p = load_config().policy
    assert set(p.vetoers()) == {"qa", "security", "reviewer"}
    assert not p.can("backend", "approve")
    with pytest.raises(PermissionDenied):
        p.require("architect", "deploy")


async def test_happy_path_reaches_deploy():
    r = FakeRunner({"qa": ["APPROVED"], "security": ["APPROVED"], "reviewer": ["APPROVED"], "cto": ["APPROVED"]})
    # first cto call is triage (no verdict consumed ambiguity): give it one extra approval slot
    r.verdicts["cto"] = ["APPROVED", "APPROVED"]
    report = await Factory(load_config(), r).run("x")
    assert report.status == "approved"
    assert r.calls[-2:] == ["git", "deploy"]


async def test_security_veto_blocks_git():
    r = FakeRunner({"qa": ["APPROVED"], "security": ["REJECTED"] * 3, "reviewer": ["APPROVED"]})
    report = await Factory(load_config(), r).run("x")
    assert report.status == "rejected" and report.blocked_by == "security"
    assert "git" not in r.calls and "deploy" not in r.calls
    assert report.rework_rounds == 2


async def test_rework_then_approve():
    r = FakeRunner({"qa": ["REJECTED", "APPROVED"], "security": ["APPROVED"], "reviewer": ["APPROVED"], "cto": ["APPROVED", "APPROVED"]})
    report = await Factory(load_config(), r).run("x")
    assert report.status == "approved" and report.rework_rounds == 1
