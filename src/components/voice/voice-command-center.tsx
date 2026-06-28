"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangleIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleIcon,
  LoaderCircleIcon,
  MicIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react"
import { motion, useMotionValue, useTransform, type PanInfo } from "motion/react"

import { AiTrustPanel } from "@/components/finance-ai/ai-trust-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/sandbox-bank/format"
import type { AgentEvent, BankAgentResult, BankState, PendingConfirmation } from "@/lib/sandbox-bank/types"
import { speakTurkish, stopTurkishSpeech } from "@/lib/voice/browser-speech"

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

type AgentStatus = {
  commandRuntime: string
  commandLabel: string
  hermes: "connected" | "service-fallback" | "service-offline" | "fallback"
}

type StepStatus = "idle" | "running" | "success" | "error" | "confirm"

type OperationStep = {
  id: string
  label: string
  detail?: string
  status: StepStatus
}

type DirectActionTab = "voice" | "text"

type TranscriptionResponse = {
  text?: string
  language?: string
  duration?: number
  model?: string
  error?: string
}

const EXAMPLES = [
  "Oğluma 100 dolar yolla",
  "Bakiyelerimi göster",
  "Kartımı dondur",
  "Borsa ve kripto durumum ne?",
]

const DEMO_APPROVALS = [
  {
    kind: "Transfer",
    title: "Anneme 500 TL gönder",
    amount: "500,00 TRY",
    command: "Anneme 500 TL gönder",
  },
  {
    kind: "Kart",
    title: "Ana kartı dondur",
    amount: "Güvenlik işlemi",
    command: "Kartımı dondur",
  },
  {
    kind: "Trade",
    title: "1000 dolarlık Apple al",
    amount: "1.000,00 USD",
    command: "1000 dolarlık Apple al",
  },
]

function dispatchStateChanged() {
  window.dispatchEvent(new CustomEvent("voice-bank-state-changed"))
}

function eventToStep(event: AgentEvent, index: number): OperationStep {
  return {
    id: `${event.type}-${index}-${event.label}`,
    label: event.label,
    detail: event.detail,
    status:
      event.type === "bank.confirmation_required"
        ? "confirm"
        : event.type === "bank.state_changed"
          ? "success"
          : "success",
  }
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <LoaderCircleIcon className="size-4 animate-spin text-primary" />
  if (status === "success") return <CheckCircle2Icon className="size-4 text-emerald-500" />
  if (status === "confirm") return <ShieldCheckIcon className="size-4 text-amber-500" />
  if (status === "error") return <AlertTriangleIcon className="size-4 text-destructive" />
  return <CircleIcon className="size-4 text-muted-foreground" />
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      {label}: {value}
    </Badge>
  )
}

function pendingPipelineSteps(command: string): OperationStep[] {
  return [
    { id: "received", label: "Komut alındı", detail: command, status: "success" },
    { id: "api-route", label: "API Route", detail: "POST /api/bank/command -> local finance orchestrator", status: "running" },
    { id: "domain-gate", label: "Finance Domain Gate", detail: "Intent ve risk sınıflandırması hazırlanıyor.", status: "running" },
    { id: "context-builder", label: "Context Builder", detail: "Sandbox hesap, kart, kişi ve pending onay context'i okunuyor.", status: "idle" },
    { id: "orchestrator", label: "Orchestrator", detail: "Agent seçimi, tool planı ve onay politikası üretilecek.", status: "idle" },
    { id: "tool-governor", label: "Tool Governor", detail: "Araç izinleri ve human approval gereksinimi kontrol edilecek.", status: "idle" },
    { id: "sub-agents", label: "Sub-agent Dispatch", detail: "Gerekirse specialist agent raporları alınacak.", status: "idle" },
    { id: "judge", label: "Judge", detail: "Final yanıt güvenlik ve tutarlılık kontrolünden geçecek.", status: "idle" },
    { id: "audit", label: "Audit Log", detail: "Trace JSONL olarak kalıcı loga yazılacak.", status: "idle" },
  ]
}

function SwipeConfirmationCard({
  pending,
  busy,
  onConfirm,
  onRunDemo,
}: {
  pending?: PendingConfirmation
  busy: boolean
  onConfirm: (approved: boolean) => void
  onRunDemo: (command: string) => void
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-180, 0, 180], [-8, 0, 8])
  const approveOpacity = useTransform(x, [30, 140], [0, 1])
  const rejectOpacity = useTransform(x, [-140, -30], [1, 0])

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!pending || busy) return
    if (info.offset.x > 120) {
      onConfirm(true)
      return
    }
    if (info.offset.x < -120) {
      onConfirm(false)
      return
    }
    x.set(0)
  }

  if (!pending) {
    return (
      <div className="mt-4 w-full rounded-lg border bg-background p-4 text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Demo onay kartları</p>
          <Badge variant="outline">Hazır</Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Bir senaryo seçin; sistem gerçek bir sandbox onayı hazırlasın.
        </p>
        <div className="mt-4 grid gap-2">
          {DEMO_APPROVALS.map((item) => (
            <button
              key={item.command}
              type="button"
              disabled={busy}
              onClick={() => onRunDemo(item.command)}
              className="rounded-lg border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge variant="secondary">{item.kind}</Badge>
                  <p className="mt-2 text-sm font-medium">{item.title}</p>
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {item.amount}
                </span>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="rounded-md bg-muted px-3 py-2">Sola kaydır: reddet</div>
          <div className="rounded-md bg-muted px-3 py-2 text-right">Sağa kaydır: onayla</div>
        </div>
      </div>
    )
  }

  const amount =
    pending.payload.kind === "transfer"
      ? formatMoney(pending.payload.amount, pending.payload.currency)
      : pending.payload.kind === "trade"
        ? formatMoney(pending.payload.quantity * pending.payload.estimatedPrice, pending.payload.currency)
        : null

  const kindLabel =
    pending.payload.kind === "transfer"
      ? "Transfer"
      : pending.payload.kind === "trade"
        ? "Trade"
        : pending.payload.kind === "card_status"
          ? "Kart"
          : "Limit"

  return (
    <div className="mt-4 w-full">
      <motion.div
        drag={busy ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={handleDragEnd}
        style={{ x, rotate }}
        className="relative cursor-grab rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm active:cursor-grabbing"
      >
        <motion.div
          style={{ opacity: approveOpacity }}
          className="pointer-events-none absolute right-4 top-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600"
        >
          ONAY
        </motion.div>
        <motion.div
          style={{ opacity: rejectOpacity }}
          className="pointer-events-none absolute left-4 top-4 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive"
        >
          RED
        </motion.div>

      <div className="flex items-start gap-2">
        <ShieldCheckIcon className="mt-0.5 size-4 text-amber-600" />
        <div className="min-w-0 flex-1">
            <Badge variant="outline">{kindLabel}</Badge>
            <p className="mt-3 text-sm font-medium">Onay bekliyor</p>
            <p className="mt-1 break-words text-sm text-muted-foreground">{pending.summary}</p>
            {amount ? <p className="mt-3 text-2xl font-semibold tabular-nums">{amount}</p> : null}
        </div>
      </div>
        <p className="mt-4 text-xs text-muted-foreground">Kartı sağa çekerek onayla, sola çekerek reddet.</p>
      </motion.div>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onConfirm(false)}>
          <XIcon className="size-4" />
          Reddet
        </Button>
        <Button className="flex-1" disabled={busy} onClick={() => onConfirm(true)}>
          <CheckCircle2Icon className="size-4" />
          Onayla
        </Button>
      </div>
    </div>
  )
}

export function VoiceCommandCenter() {
  const [input, setInput] = useState("")
  const [activeTab, setActiveTab] = useState<DirectActionTab>("voice")
  const [busy, setBusy] = useState(false)
  const [showReasoningAudit, setShowReasoningAudit] = useState(true)
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [liveThoughts, setLiveThoughts] = useState("")
  const [liveAnswer, setLiveAnswer] = useState("")
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [state, setState] = useState<BankState | null>(null)
  const [lastAssistantMessage, setLastAssistantMessage] = useState(
    "Merhaba, Türkçe komut verebilirsiniz. İşlemler onay alınmadan uygulanmaz."
  )
  const [messages, setMessages] = useState<BankAgentResult["transcript"]>([
    {
      role: "assistant",
      text: "Merhaba. Komutu yazabilir veya mikrofona basıp yerel Whisper ile metne çevirebilirsiniz.",
      at: new Date().toISOString(),
    },
  ])
  const [steps, setSteps] = useState<OperationStep[]>([
    {
      id: "ready",
      label: "Hazır",
      detail: "Yerel Whisper girişi ve banking toolset beklemede.",
      status: "idle",
    },
  ])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const speechAvailable = useMemo(() => {
    if (typeof window === "undefined") return false
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  }, [])

  const refreshState = async () => {
    const response = await fetch("/api/bank/state", { cache: "no-store" })
    const next = (await response.json()) as BankState
    setState(next)
    return next
  }

  useEffect(() => {
    refreshState()
    fetch("/api/agent/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setStatus(payload as AgentStatus))
      .catch(() => {
        setStatus({
          commandRuntime: "local-orchestrator",
          commandLabel: "Yerel finance orchestrator",
          hermes: "fallback",
        })
      })
  }, [])

  const applyResult = (result: BankAgentResult) => {
    setState(result.state)
    setLastAssistantMessage(result.message)
    setMessages((current) => [...current, ...result.transcript].slice(-10))
    setSteps([
      {
        id: "received",
        label: "Komut alındı",
        detail: result.transcript[0]?.text,
        status: "success",
      },
      {
        id: "runtime",
        label: "Runtime",
        detail: status?.commandLabel ?? "Yerel finance orchestrator",
        status: "success",
      },
      ...(result.orchestration?.traceId
        ? [
            {
              id: "trace-id",
              label: "Trace ID",
              detail: result.orchestration.traceId,
              status: "success" as const,
            },
          ]
        : []),
      ...result.events.map(eventToStep),
    ])
    dispatchStateChanged()
    if (ttsEnabled) void speakTurkish(result.message)
  }

  const sendCommand = async (text?: string) => {
    const commandText = typeof text === "string" ? text : input
    const trimmed = commandText.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setSteps(pendingPipelineSteps(trimmed))
    try {
      const response = await fetch("/api/bank/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      })

      if (!response.ok) {
        throw new Error("Agent komutu tamamlanamadı.")
      }

      setLiveThoughts("")
      setLiveAnswer("")

      const reader = response.body?.getReader()
      if (!reader) throw new Error("Tarayıcı stream desteklemiyor.")
      const decoder = new TextDecoder("utf-8")
      let finalResult: BankAgentResult | null = null

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === "chunk") {
                if (data.isThinking) {
                  setLiveThoughts((prev) => prev + data.chunk)
                } else {
                  setLiveAnswer((prev) => prev + data.chunk)
                }
              } else if (data.type === "result") {
                finalResult = data.payload as BankAgentResult
              }
            } catch (e) {
              // Ignore incomplete JSON chunks
            }
          }
        }
      }

      setLiveThoughts("")
      setLiveAnswer("")
      if (finalResult) {
        applyResult(finalResult)
      }
      setInput("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen hata"
      const assistantMessage: BankAgentResult["transcript"][number] = {
        role: "assistant",
        text: message,
        at: new Date().toISOString(),
      }
      setLastAssistantMessage(message)
      setMessages((current) => [...current, assistantMessage].slice(-10))
      setSteps((current) => [
        ...current.filter((step) => step.status !== "running"),
        { id: "error", label: "Hata", detail: message, status: "error" },
      ])
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (approved: boolean) => {
    if (!state?.pendingConfirmation || busy) return
    setBusy(true)
    setSteps((current) => [
      ...current,
      {
        id: "confirming",
        label: approved ? "Onay uygulanıyor" : "İptal ediliyor",
        detail: state.pendingConfirmation?.summary,
        status: "running",
      },
    ])
    try {
      const response = await fetch("/api/bank/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmationId: state.pendingConfirmation.id,
          approved,
        }),
      })
      applyResult((await response.json()) as BankAgentResult)
    } finally {
      setBusy(false)
    }
  }

  const fillPrompt = (prompt: string) => {
    setInput(prompt)
    setActiveTab("text")
  }

  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true)
    setSteps([
      { id: "whisper-upload", label: "Whisper Fast", detail: "Ses yerel faster-whisper modeline gönderiliyor.", status: "running" },
    ])
    try {
      const formData = new FormData()
      formData.append("audio", blob, "voice-command.webm")
      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json()) as TranscriptionResponse
      if (!response.ok || !payload.text?.trim()) {
        throw new Error(payload.error ?? "Ses metne çevrilemedi.")
      }

      const transcript = payload.text.trim()
      setInput(transcript)
      setActiveTab("text")
      setLastAssistantMessage("Transkript hazır. Kontrol edip Gönder'e basabilirsiniz.")
      setSteps([
        {
          id: "whisper-ready",
          label: "Transkript hazır",
          detail: transcript,
          status: "success",
        },
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : "Whisper transkripsiyon hatası"
      setLastAssistantMessage(message)
      setSteps([{ id: "whisper-error", label: "Whisper hatası", detail: message, status: "error" }])
    } finally {
      setTranscribing(false)
    }
  }

  const startLocalRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) return false

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm"
    const recorder = new MediaRecorder(stream, { mimeType })
    audioChunksRef.current = []
    mediaStreamRef.current = stream
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
      mediaRecorderRef.current = null
      const audio = new Blob(audioChunksRef.current, { type: mimeType })
      audioChunksRef.current = []
      if (audio.size > 0) void transcribeAudio(audio)
    }

    recorder.start()
    setListening(true)
    setSteps([{ id: "recording", label: "Kayıt alınıyor", detail: "Bitirince metne çevrilecek; otomatik gönderilmeyecek.", status: "running" }])
    return true
  }

  const startBrowserRecognition = () => {
    setActiveTab("voice")
    if (!speechAvailable || listening) return
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) return
    const recognition = new Recognition()
    recognition.lang = "tr-TR"
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ""
      setInput(transcript)
      setActiveTab("text")
      if (transcript) {
        setLastAssistantMessage("Tarayıcı transkripti hazır. Kontrol edip Gönder'e basabilirsiniz.")
        setSteps([{ id: "browser-transcript", label: "Transkript hazır", detail: transcript, status: "success" }])
      }
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setSteps((current) => [
        ...current,
        { id: "speech-error", label: "Ses algılanamadı", detail: "Metin komutu kullanılabilir.", status: "error" },
      ])
    }
    recognitionRef.current = recognition
    setListening(true)
    setSteps([{ id: "listening", label: "Dinliyorum", detail: "Türkçe komut bekleniyor.", status: "running" }])
    recognition.start()
  }

  const startListening = async () => {
    setActiveTab("voice")
    if (listening || transcribing) return
    try {
      const localStarted = await startLocalRecording()
      if (localStarted) return
    } catch (error) {
      setSteps([
        {
          id: "recorder-error",
          label: "Mikrofon açılamadı",
          detail: error instanceof Error ? error.message : "Tarayıcı konuşma tanımaya geçiliyor.",
          status: "error",
        },
      ])
    }
    startBrowserRecognition()
  }

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    recognitionRef.current?.stop()
    setListening(false)
  }

  const handleVoiceButton = () => {
    setActiveTab("voice")

    if (listening) {
      stopListening()
      return
    }

    void startListening()
  }

  return (
    <section className="bg-background">
      <div className="mx-auto w-full max-w-7xl">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-normal">Direkt İşlem</h2>
                <Badge variant="secondary" className="gap-1.5">
                  <SparklesIcon className="size-3" />
                  Türkçe agent
                </Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{lastAssistantMessage}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge label="Hermes" value={status?.hermes === "connected" ? "aktif" : "banking toolset"} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (ttsEnabled) stopTurkishSpeech()
                  setTtsEnabled((current) => !current)
                }}
              >
                {ttsEnabled ? <Volume2Icon className="size-4" /> : <VolumeXIcon className="size-4" />}
                TTS
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="flex min-h-64 flex-col items-center rounded-lg border bg-muted/30 p-4 text-center">
              <button
                type="button"
                aria-label={listening ? "Dinlemeyi durdur" : "Sesli komutu başlat"}
                disabled={busy}
                onClick={handleVoiceButton}
                className={cn(
                  "relative grid size-32 place-items-center rounded-full border text-primary transition-all duration-200",
                  "bg-background shadow-sm hover:scale-[1.02] hover:border-primary/50 hover:shadow-md",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  listening && "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20",
                  busy && "cursor-wait opacity-80"
                )}
              >
                {(listening || busy) && (
                  <>
                    <span className="absolute -inset-3 rounded-full border border-primary/25 animate-pulse" />
                    <span className="absolute inset-0 rounded-full border border-primary/40 animate-ping" />
                  </>
                )}
                {busy || transcribing ? (
                  <LoaderCircleIcon className="size-11 animate-spin" />
                ) : listening ? (
                  <SquareIcon className="size-10" />
                ) : (
                  <MicIcon className="size-12" />
                )}
              </button>
              <p className="mt-4 text-base font-semibold">
                {transcribing ? "Metne çeviriyorum" : listening ? "Kaydı bitir" : busy ? "Düşünüyor" : "Konuş"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {listening ? "Tekrar basınca Whisper transkripsiyonu başlar." : activeTab === "voice" ? "Yerel Whisper input" : "Yazılı işlem"}
              </p>
              <SwipeConfirmationCard
                pending={state?.pendingConfirmation}
                busy={busy}
                onConfirm={confirm}
                onRunDemo={(command) => sendCommand(command)}
              />
            </div>

            <div className="min-w-0">
              <div className="mb-4 rounded-lg border bg-background">
                <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                  <p className="text-sm font-medium">Chat</p>
                  <Badge variant={busy ? "outline" : "secondary"}>
                    {busy ? "Yanıt bekleniyor" : "Hazır"}
                  </Badge>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                  {messages.map((message, index) => (
                    <div
                      key={`${message.at}-${index}`}
                      className={cn(
                        "max-w-[88%] rounded-lg px-3 py-2 text-sm",
                        message.role === "user"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      <p className="break-words">{message.text}</p>
                    </div>
                  ))}
                  {busy ? (
                    <div className="flex max-w-[88%] flex-col gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <LoaderCircleIcon className="size-4 animate-spin" />
                        Yerel ajan çalışıyor
                      </div>
                      {liveThoughts && (
                        <details open className="mt-1 rounded-md border border-primary/20 bg-background/50 p-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-medium text-primary">🤔 Düşünce Süreci</summary>
                          <div className="mt-2 whitespace-pre-wrap">{liveThoughts}</div>
                        </details>
                      )}
                      {liveAnswer && (
                        <div className="mt-1 whitespace-pre-wrap">{liveAnswer}</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Pipeline log</p>
                  <Badge variant="outline">{steps.length} event</Badge>
                </div>

                <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border bg-background p-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    {steps.map((step, index) => (
                      <div
                        key={`${step.id}-${index}`}
                        className={cn(
                          "flex min-w-0 items-start gap-2 rounded-lg border p-2",
                          step.status === "error" && "border-destructive/40 bg-destructive/5",
                          step.status === "running" && "border-primary/30 bg-primary/5",
                          step.status === "confirm" && "border-amber-500/40 bg-amber-500/10"
                        )}
                      >
                        <StepIcon status={step.status} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <p className="truncate text-sm font-medium">{step.label}</p>
                          </div>
                          {step.detail ? <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{step.detail}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mb-4 overflow-hidden rounded-lg border bg-background">
                <button
                  type="button"
                  onClick={() => setShowReasoningAudit((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <BrainCircuitIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Reasoning audit</p>
                      <p className="text-xs text-muted-foreground">
                        Ham chain-of-thought yerine güvenli orchestration özeti
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{showReasoningAudit ? "Açık" : "Kapalı"}</Badge>
                    {showReasoningAudit ? (
                      <ChevronUpIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDownIcon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
                {showReasoningAudit ? (
                  <div className="border-t">
                    <AiTrustPanel />
                  </div>
                ) : null}
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as DirectActionTab)}
                className="h-full"
              >
                <TabsList>
                  <TabsTrigger value="voice">
                    <MicIcon className="size-4" />
                    Sesli işlem
                  </TabsTrigger>
                  <TabsTrigger value="text">
                    <SendIcon className="size-4" />
                    Yazılı komut
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="voice" className="mt-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-sm font-medium">Canlı komut</p>
                      <p className="mt-2 min-h-16 break-words text-lg text-muted-foreground">
                        {input || "Mikrofona basın; metin burada görünecek."}
                      </p>
                    </div>
                    <Button
                      className="h-full min-h-24 px-6"
                      disabled={busy || transcribing}
                      onClick={handleVoiceButton}
                      variant={listening ? "destructive" : "default"}
                    >
                      {listening ? <SquareIcon className="size-4" /> : <MicIcon className="size-4" />}
                      {transcribing ? "Çevriliyor" : listening ? "Bitir" : "Kaydet"}
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {EXAMPLES.map((example) => (
                      <Button key={example} variant="outline" size="sm" onClick={() => fillPrompt(example)}>
                        {example}
                      </Button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="text" className="mt-3">
                  <div className="space-y-2">
                    <Textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault()
                          sendCommand()
                        }
                      }}
                      className="min-h-28 resize-none text-base"
                      placeholder="Örn. Oğluma 100 dolar yolla"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy || !input.trim()} onClick={() => sendCommand()}>
                        {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
                        Gönder
                      </Button>
                      {EXAMPLES.map((example) => (
                        <Button key={example} variant="ghost" size="sm" onClick={() => fillPrompt(example)}>
                          {example}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
