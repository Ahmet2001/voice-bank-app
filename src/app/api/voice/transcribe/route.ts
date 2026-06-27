import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type TranscriptionPayload = {
  text?: string
  language?: string
  languageProbability?: number
  duration?: number
  model?: string
  error?: string
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null)
  const file = formData?.get("audio")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "audio dosyası gerekli." }, { status: 400 })
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "voicebank-whisper-"))
  const extension = extensionFor(file.type)
  const audioPath = path.join(tempDir, `input.${extension}`)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(audioPath, buffer)
    const payload = await transcribe(audioPath)

    if (payload.error || !payload.text?.trim()) {
      return NextResponse.json(
        {
          error: payload.error ?? "Ses metne çevrilemedi.",
          text: payload.text ?? "",
        },
        { status: 422 }
      )
    }

    return NextResponse.json(payload)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4"
  if (mimeType.includes("mpeg")) return "mp3"
  if (mimeType.includes("ogg")) return "ogg"
  if (mimeType.includes("wav")) return "wav"
  return "webm"
}

function defaultWhisperPython() {
  const localVenvPython = path.join(os.homedir(), ".cache", "voicebank-whisper-venv", "bin", "python")
  return process.env.WHISPER_PYTHON ?? localVenvPython
}

function transcribe(audioPath: string): Promise<TranscriptionPayload> {
  const python = defaultWhisperPython()
  const script = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "scripts",
    "transcribe_faster_whisper.py"
  )
  const child = spawn(python, [script, audioPath, "--language", "tr"], {
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let stdout = ""
  let stderr = ""
  const timeout = setTimeout(() => {
    child.kill("SIGTERM")
  }, Number(process.env.WHISPER_TIMEOUT_MS ?? 120000))

  return new Promise((resolve) => {
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        resolve({
          error:
            stderr.trim() ||
            `faster-whisper process exited with code ${code}. Python: ${python}`,
        })
        return
      }

      try {
        resolve(JSON.parse(stdout) as TranscriptionPayload)
      } catch {
        resolve({ error: stdout.trim() || stderr.trim() || "Whisper çıktısı okunamadı." })
      }
    })
    child.on("error", (error) => {
      clearTimeout(timeout)
      resolve({
        error: `${python} çalıştırılamadı: ${error.message}`,
      })
    })
  })
}
