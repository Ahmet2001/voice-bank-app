# VoiceBank Agent Service

FastAPI service for the VoiceBank sandbox agent.

It shares the same SQLite sandbox file as the Next.js app by default:

```powershell
cd agent-service
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8787
```

Then set the web app env:

```env
AGENT_SERVICE_URL=http://localhost:8787
```

Optional realtime voice start proxy:

```env
PIPECAT_BOT_START_URL=https://your-pipecat-bot/start
PIPECAT_BOT_START_PUBLIC_API_KEY=...
```

Optional Hermes adapter:

```env
HERMES_AGENT_PATH=C:\path\to\hermes-agent
HERMES_MODEL=gpt-4.1-mini
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
```

If Hermes is not configured, the service falls back to the deterministic banking tool runner while preserving the same confirmation safety model.
