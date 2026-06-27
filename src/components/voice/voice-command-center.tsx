"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  MicIcon,
  RadioIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import {
  ConnectButton,
  ControlBar,
  PipecatAppBase,
  TranscriptOverlay,
  UserAudioControl,
  VoiceVisualizer,
  type PipecatBaseChildProps,
} from "@pipecat-ai/voice-ui-kit"
import { motion, useMotionValue, useTransform, type PanInfo } from "motion/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/sandbox-bank/format"
import type { AgentEvent, BankAgentResult, BankState, PendingConfirmation } from "@/lib/sandbox-bank/types"

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
  pipecat: "configured" | "browser-fallback"
}

type StepStatus = "idle" | "running" | "success" | "error" | "confirm"

type OperationStep = {
  id: string
  label: string
  detail?: string
  status: StepStatus
}

type DirectActionTab = "voice" | "text"

const EXAMPLES = [
  "Oğluma 100 dolar yolla",
  "Bakiyelerimi göster",
  "Kartımı dondur",
  "Borsa ve kripto durumum ne?",
]

function dispatchStateChanged() {
  window.dispatchEvent(new CustomEvent("voice-bank-state-changed"))
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = "tr-TR"
  utterance.rate = 0.98
  window.speechSynthesis.speak(utterance)
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

function RealtimeVoiceBlock() {
  return (
    <PipecatAppBase
      noThemeProvider
      transportType="smallwebrtc"
      startBotParams={{
        endpoint: "/api/voice/start",
        requestData: {
          transport: "webrtc",
          locale: "tr-TR",
        },
      }}
      transportOptions={{ waitForICEGathering: true }}
    >
      {({ client, handleConnect, handleDisconnect, error }: PipecatBaseChildProps) => (
        <div className="flex h-full min-h-44 flex-col justify-between gap-3 rounded-lg border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <RadioIcon className="size-4 text-primary" />
              <span className="truncate text-sm font-medium">Pipecat realtime</span>
            </div>
            <Badge variant={error ? "destructive" : "secondary"}>
              {error ? "Fallback" : client ? "Hazır" : "Yükleniyor"}
            </Badge>
          </div>

          {client ? (
            <div className="relative flex min-h-24 items-center justify-center overflow-hidden rounded-lg bg-muted/40 text-primary">
              <VoiceVisualizer
                participantType="bot"
                barColor="currentColor"
                barCount={7}
                barGap={6}
                barWidth={10}
                barMaxHeight={70}
              />
              <TranscriptOverlay participant="remote" className="absolute inset-x-3 bottom-3" />
            </div>
          ) : (
            <div className="flex min-h-24 items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">
              Ses oturumu hazırlanıyor
            </div>
          )}

          {client ? (
            <ControlBar>
              <UserAudioControl />
              <ConnectButton
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                stateContent={{
                  initialized: { children: "Bağlan", variant: "active" },
                  disconnected: { children: "Bağlan", variant: "active" },
                  connecting: { children: "Bağlanıyor", variant: "secondary" },
                  ready: { children: "Kapat", variant: "destructive" },
                  disconnecting: { children: "Kapanıyor", variant: "secondary" },
                  error: { children: "Hata", variant: "destructive" },
                }}
              />
            </ControlBar>
          ) : null}

          {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
        </div>
      )}
    </PipecatAppBase>
  )
}

function SwipeConfirmationCard({
  pending,
  busy,
  onConfirm,
}: {
  pending?: PendingConfirmation
  busy: boolean
  onConfirm: (approved: boolean) => void
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
      <div className="mt-4 w-full rounded-lg border border-dashed bg-background p-4 text-left">
        <p className="text-sm font-medium">Onay kartı</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Transfer, kart veya trade isteği gelince burada büyük bir kart açılır.
        </p>
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
  const [input, setInput] = useState("Oğluma 100 dolar yolla")
  const [activeTab, setActiveTab] = useState<DirectActionTab>("voice")
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [state, setState] = useState<BankState | null>(null)
  const [lastAssistantMessage, setLastAssistantMessage] = useState(
    "Merhaba, Türkçe komut verebilirsiniz. İşlemler onay alınmadan uygulanmaz."
  )
  const [steps, setSteps] = useState<OperationStep[]>([
    {
      id: "ready",
      label: "Hazır",
      detail: "Pipecat ses katmanı ve banking toolset beklemede.",
      status: "idle",
    },
  ])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

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
          commandRuntime: "local-sandbox",
          commandLabel: "Yerel sandbox agent",
          hermes: "fallback",
          pipecat: "browser-fallback",
        })
      })
  }, [])

  const applyResult = (result: BankAgentResult) => {
    setState(result.state)
    setLastAssistantMessage(result.message)
    setSteps([
      { id: "received", label: "Komut alındı", detail: result.transcript[0]?.text, status: "success" },
      { id: "hermes", label: "Hermes banking toolset", detail: status?.commandLabel ?? "Yerel sandbox agent", status: "success" },
      ...result.events.map(eventToStep),
    ])
    dispatchStateChanged()
    speak(result.message)
  }

  const sendCommand = async (text = input) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setSteps([
      { id: "received", label: "Komut alındı", detail: trimmed, status: "success" },
      { id: "search", label: "Arıyorum", detail: "Search: Hermes banking toolset uygun hesap, kişi ve işlem niyetini tarıyor.", status: "running" },
    ])
    try {
      const response = await fetch("/api/bank/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      })

      if (!response.ok) {
        throw new Error("Agent komutu tamamlanamadı.")
      }

      applyResult((await response.json()) as BankAgentResult)
      setInput("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen hata"
      setLastAssistantMessage(message)
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

  const startListening = () => {
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
      if (transcript) sendCommand(transcript)
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

  const stopListening = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  const handleVoiceButton = () => {
    setActiveTab("voice")

    if (listening) {
      stopListening()
      return
    }

    if (speechAvailable) {
      startListening()
      return
    }

    setListening(true)
    setLastAssistantMessage("Pipecat realtime hazır. Yazılı komut aynı Hermes banking agent ile çalışır.")
    setSteps([
      {
        id: "pipecat-fallback",
        label: "Dinliyorum",
        detail: "Pipecat realtime paneli hazır; tarayıcı konuşma tanıma izni bekleniyor.",
        status: "running",
      },
    ])
    window.setTimeout(() => setListening(false), 1400)
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
              <StatusBadge label="Pipecat" value={status?.pipecat === "configured" ? "realtime" : "fallback"} />
              <StatusBadge label="Hermes" value={status?.hermes === "connected" ? "aktif" : "banking toolset"} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_300px]">
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
                {busy ? <LoaderCircleIcon className="size-11 animate-spin" /> : <MicIcon className="size-12" />}
              </button>
              <p className="mt-4 text-base font-semibold">{listening ? "Dinliyorum" : busy ? "Konuşuyor" : "Konuş"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === "voice" ? "Sesli işlem" : "Yazılı işlem"}
              </p>
              <SwipeConfirmationCard pending={state?.pendingConfirmation} busy={busy} onConfirm={confirm} />
            </div>

            <div className="min-w-0">
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
                        {input || "Oğluma 100 dolar yolla"}
                      </p>
                    </div>
                    <Button
                      className="h-full min-h-24 px-6"
                      disabled={busy}
                      onClick={handleVoiceButton}
                      variant={listening ? "destructive" : "default"}
                    >
                      <MicIcon className="size-4" />
                      {listening ? "Durdur" : "Başlat"}
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {EXAMPLES.map((example) => (
                      <Button key={example} variant="outline" size="sm" onClick={() => sendCommand(example)}>
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
                        <Button key={example} variant="ghost" size="sm" onClick={() => sendCommand(example)}>
                          {example}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">İşlem akışı</p>
                <Badge variant="outline">Search log</Badge>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {steps.slice(-6).map((step) => (
                  <div
                    key={step.id}
                    className={cn(
                      "flex min-w-0 items-start gap-2 rounded-lg border p-2",
                      step.status === "error" && "border-destructive/40 bg-destructive/5"
                    )}
                  >
                    <StepIcon status={step.status} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{step.label}</p>
                      {step.detail ? <p className="line-clamp-2 text-xs text-muted-foreground">{step.detail}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <RealtimeVoiceBlock />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
