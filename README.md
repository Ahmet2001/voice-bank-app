## Local finance AI orchestration

The VoiceBank sandbox includes a local/on-prem finance orchestration layer. All
agent roles use the same Ollama model, `qwen3:4b`; role behavior comes only from
system prompts.

```bash
ollama serve
ollama pull qwen3:4b
pnpm dev
```

Optional environment defaults:

```txt
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
```

Demo commands:

- `Bana biyoloji ödevi anlat.`
- `Bakiyem ne kadar?`
- `Anneme 500 TL gönder.`
- `1000 dolarlık Apple al.`
- `ETF nedir, bana basit anlat.`
- `Portföyüm riskli mi?`

### Local Whisper voice input

The Direct Action voice tab records microphone audio in the browser, sends it to
`/api/voice/transcribe`, and transcribes it locally with `faster-whisper`.
The transcript is placed into the text box first; it is not sent automatically.

Installed local Python default:

```txt
WHISPER_PYTHON=/home/rifat/.cache/voicebank-whisper-venv/bin/python
WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

Browser TTS still uses the local browser `speechSynthesis` engine, with Turkish
voice selection when available.
