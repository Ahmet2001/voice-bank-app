from __future__ import annotations

import os
import sys
from typing import Any

from .banking import BankSandbox


class HermesBankAgent:
    """Optional Hermes adapter scoped to a single banking toolset.

    The deterministic BankSandbox remains the fallback and test path. When a
    Hermes checkout and model credentials are configured, this adapter exposes
    one bank_command tool to Hermes and asks the model to use it for banking
    actions.
    """

    def __init__(self, sandbox: BankSandbox):
        self.sandbox = sandbox
        self.enabled = bool(os.environ.get("HERMES_AGENT_PATH") and os.environ.get("OPENAI_API_KEY"))

    def run(self, text: str) -> dict[str, Any]:
        if not self.enabled:
            return self.sandbox.run_command(text)

        try:
            hermes_path = os.environ["HERMES_AGENT_PATH"]
            if hermes_path not in sys.path:
                sys.path.insert(0, hermes_path)

            from run_agent import AIAgent
            from tools.registry import registry

            def bank_command(args: dict[str, Any], **_: Any) -> str:
                return self.sandbox.run_command(str(args.get("text", "")))["message"]

            registry.register(
                name="bank_command",
                toolset="banking",
                schema={
                    "name": "bank_command",
                    "description": "Run one sandbox banking instruction. Mutations create or resolve confirmations.",
                    "parameters": {
                        "type": "object",
                        "properties": {"text": {"type": "string"}},
                        "required": ["text"],
                    },
                },
                handler=bank_command,
                description="VoiceBank sandbox banking command",
                override=True,
            )

            agent = AIAgent(
                base_url=os.environ.get("OPENAI_BASE_URL"),
                api_key=os.environ.get("OPENAI_API_KEY"),
                provider=os.environ.get("HERMES_PROVIDER", "openai"),
                model=os.environ.get("HERMES_MODEL", "gpt-4.1-mini"),
                enabled_toolsets=["banking"],
                max_iterations=8,
                quiet_mode=True,
                ephemeral_system_prompt=(
                    "You are VoiceBank, a Turkish banking agent. "
                    "Use bank_command for every banking request. "
                    "Never claim real money moved; this is a sandbox."
                ),
            )
            answer = agent.run_conversation(text)
            state = self.sandbox.read_state()
            stamp = state["updatedAt"]
            return {
                "message": str(answer),
                "events": [{"type": "bank.tool_progress", "label": "Hermes agent", "detail": "banking toolset"}],
                "state": state,
                "transcript": [
                    {"role": "user", "text": text, "at": stamp},
                    {"role": "assistant", "text": str(answer), "at": stamp},
                ],
            }
        except Exception:
            return self.sandbox.run_command(text)
