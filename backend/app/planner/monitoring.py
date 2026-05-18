"""Monitoring & rebalancing — works on real `AgentRun` events instead of
simulated ones. Watches for stuck/delayed agents and surfaces actions to the UI.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Iterable

from app.schemas import (
    AllocatedResource,
    ResourceAllocation,
    ResourceType,
    TaskStatus,
)


class MonitoringEngine:
    DELAY_AFTER_MIN = 4  # if an agent has been "in_progress" longer than this -> warn
    NO_PROGRESS_PCT = 5  # if progress hasn't moved in N minutes -> warn

    def check(
        self,
        agent_runs: Iterable[dict],
        allocation: ResourceAllocation | None = None,
    ) -> dict | None:
        """Return a rebalancing event dict, or None if everything looks fine."""
        runs = list(agent_runs)
        issues: list[dict] = []
        now = datetime.now(timezone.utc)

        for run in runs:
            started_at = run.get("started_at")
            if isinstance(started_at, str):
                started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            status = run.get("status")
            progress = run.get("progress") or 0
            agent = run.get("agent_id", "agent")

            if status == TaskStatus.DELAYED.value:
                issues.append({"type": "task_delay", "agent": agent, "progress": progress})

            elif (
                status == TaskStatus.IN_PROGRESS.value
                and started_at
                and now - started_at > timedelta(minutes=self.DELAY_AFTER_MIN)
                and progress < 60
            ):
                issues.append({"type": "slow_progress", "agent": agent, "progress": progress})

        # Bottleneck: same agent_id has >2 open tasks
        load: dict[str, int] = {}
        for run in runs:
            if run.get("status") in (TaskStatus.IN_PROGRESS.value, TaskStatus.DELAYED.value):
                aid = run.get("agent_id", "")
                load[aid] = load.get(aid, 0) + 1
        for aid, count in load.items():
            if count > 2:
                issues.append({"type": "overload", "agent": aid, "task_count": count})

        if not issues:
            return None

        actions = self._actions(issues, allocation)
        return {
            "trigger": issues[0]["type"],
            "issues": issues,
            "actions": actions,
            "explanation": self._explain(issues, actions),
            "detected_at": now.isoformat(),
        }

    def _actions(self, issues, allocation) -> list[dict]:
        out: list[dict] = []
        for issue in issues:
            if issue["type"] == "task_delay":
                helper = self._find_helper(allocation)
                out.append({
                    "action_type": "reassign_support",
                    "target": issue["agent"],
                    "new_resource": helper,
                    "reasoning": (
                        f"Agent '{issue['agent']}' is delayed at "
                        f"{issue.get('progress', 0)}%. Adding {helper} to accelerate."
                    ),
                })
            elif issue["type"] == "overload":
                out.append({
                    "action_type": "load_balance",
                    "target": issue["agent"],
                    "new_resource": "redistribute",
                    "reasoning": (
                        f"{issue['agent']} has {issue['task_count']} concurrent tasks; "
                        "rebalancing across team."
                    ),
                })
            elif issue["type"] == "slow_progress":
                out.append({
                    "action_type": "boost",
                    "target": issue["agent"],
                    "new_resource": "Forge-DevOps",
                    "reasoning": (
                        f"Agent '{issue['agent']}' progress at {issue['progress']}% — "
                        "spinning up an automation agent in parallel."
                    ),
                })
        return out

    @staticmethod
    def _find_helper(allocation) -> str:
        if allocation:
            for r in allocation.team:
                if "agent" in r.resource_type.value.lower():
                    return r.name
        return AllocatedResource(
            resource_type=ResourceType.AUTOMATION_AGENT,
            name="Forge-DevOps",
            allocation_percentage=1.0,
            skills=["devops"],
            cost_per_day=45,
        ).name

    @staticmethod
    def _explain(issues, actions) -> str:
        lines = [f"Detected {len(issues)} issue(s) during execution monitoring."]
        for i in issues:
            t = i["type"]
            if t == "task_delay":
                lines.append(f"- delay on {i['agent']} at {i.get('progress', 0)}%")
            elif t == "overload":
                lines.append(f"- overload: {i['agent']} ({i['task_count']} tasks)")
            elif t == "slow_progress":
                lines.append(f"- slow progress on {i['agent']} ({i['progress']}%)")
        lines.append(f"Applied {len(actions)} corrective action(s):")
        for a in actions:
            lines.append(f"- {a['action_type']}: {a['reasoning']}")
        return "\n".join(lines)
