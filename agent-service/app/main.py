from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .banking import BankSandbox
from .hermes_adapter import HermesBankAgent

app = FastAPI(title="VoiceBank Agent Service")
sandbox = BankSandbox()
agent = HermesBankAgent(sandbox)


class CommandRequest(BaseModel):
    text: str


class ConfirmRequest(BaseModel):
    confirmationId: str
    approved: bool


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "hermes": agent.enabled}


@app.post("/bank/command")
def bank_command(request: CommandRequest) -> dict[str, Any]:
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    return agent.run(request.text)


@app.post("/bank/confirm")
def bank_confirm(request: ConfirmRequest) -> dict[str, Any]:
    return sandbox.confirm(request.confirmationId, request.approved)


@app.post("/start")
async def start_voice_session(payload: dict[str, Any]) -> dict[str, Any]:
    start_url = os.environ.get("PIPECAT_BOT_START_URL")
    if not start_url:
        raise HTTPException(
            status_code=503,
            detail="PIPECAT_BOT_START_URL is not configured. Browser speech fallback remains available.",
        )

    headers = {"content-type": "application/json"}
    public_key = os.environ.get("PIPECAT_BOT_START_PUBLIC_API_KEY")
    if public_key:
        headers["authorization"] = f"Bearer {public_key}"

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(start_url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
