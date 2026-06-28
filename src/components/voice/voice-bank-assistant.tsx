"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  CheckIcon,
  LoaderCircleIcon,
  MicIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { formatMoney } from "@/lib/sandbox-bank/format"
import type { BankAgentResult, BankState, PendingConfirmation } from "@/lib/sandbox-bank/types"
import { speakTurkish } from "@/lib/voice/browser-speech"

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

const EXAMPLE_COMMANDS = [
  "Oğluma 100 dolar yolla",
  "Bakiyelerimi göster",
  "Kartımı dondur",
  "Borsa ve kripto durumum ne?",
]

function dispatchStateChanged() {
  window.dispatchEvent(new CustomEvent("voice-bank-state-changed"))
}

function ConfirmationBox({
  pending,
  busy,
  onConfirm,
}: {
  pending?: PendingConfirmation
  busy: boolean
  onConfirm: (approved: boolean) => void
}) {
  if (!pending) return null

  const amount =
    pending.payload.kind === "transfer"
      ? formatMoney(pending.payload.amount, pending.payload.currency)
      : pending.payload.kind === "trade"
        ? formatMoney(pending.payload.quantity * pending.payload.estimatedPrice, pending.payload.currency)
        : null

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start gap-2">
        <ShieldCheckIcon className="mt-0.5 size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Onay bekleniyor</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{pending.summary}</p>
          {amount ? <p className="mt-2 text-lg font-semibold tabular-nums">{amount}</p> : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={busy} onClick={() => onConfirm(false)}>
          <XIcon className="size-4" />
          Reddet
        </Button>
        <Button disabled={busy} onClick={() => onConfirm(true)}>
          <CheckIcon className="size-4" />
          Onayla
        </Button>
      </div>
    </div>
  )
}

export function VoiceBankAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [state, setState] = useState<BankState | null>(null)
  const [messages, setMessages] = useState<BankAgentResult["transcript"]>([
    {
      role: "assistant",
      text: "Merhaba, sandbox bankanız hazır. Para gönderebilir, bakiye sorabilir veya kartınızı yönetebilirsiniz.",
      at: new Date().toISOString(),
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
  }, [])

  const applyResult = (result: BankAgentResult) => {
    setState(result.state)
    setMessages((current) => [...current, ...result.transcript].slice(-8))
    dispatchStateChanged()
    void speakTurkish(result.message)
  }

  const sendCommand = async (text = input) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const response = await fetch("/api/bank/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      })
      applyResult((await response.json()) as BankAgentResult)
      setInput("")
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (approved: boolean) => {
    if (!state?.pendingConfirmation || busy) return
    setBusy(true)
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
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  return (
    <>
      <Button
        size="icon-lg"
        className="fixed right-4 bottom-4 z-40 size-14 rounded-full shadow-xl md:right-6 md:bottom-6"
        onClick={() => setOpen(true)}
      >
        <MicIcon className="size-6" />
        <span className="sr-only">VoiceBank agent</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] rounded-t-xl p-0 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[430px] sm:rounded-xl sm:border" showCloseButton>
          <SheetHeader className="border-b p-4">
            <div className="flex items-center justify-between gap-3 pr-8">
              <div>
                <SheetTitle>VoiceBank Agent</SheetTitle>
                <SheetDescription>Türkçe sandbox bankacılık oturumu</SheetDescription>
              </div>
              <Badge variant={state?.pendingConfirmation ? "destructive" : "secondary"}>
                {state?.pendingConfirmation ? "Onay" : "Hazır"}
              </Badge>
            </div>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <ConfirmationBox pending={state?.pendingConfirmation} busy={busy} onConfirm={confirm} />

            <div className="space-y-2">
              {messages.map((message, index) => (
                <div
                  key={`${message.at}-${index}`}
                  className={
                    message.role === "assistant"
                      ? "mr-8 rounded-lg bg-muted p-3 text-sm"
                      : "ml-8 rounded-lg bg-primary p-3 text-sm text-primary-foreground"
                  }
                >
                  {message.text}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {EXAMPLE_COMMANDS.map((command) => (
                <Button key={command} variant="outline" size="sm" className="h-auto justify-start text-wrap py-2 text-left" onClick={() => setInput(command)}>
                  <SparklesIcon className="size-3.5" />
                  {command}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t p-4">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  sendCommand()
                }
              }}
              className="min-h-20 resize-none"
              placeholder="Örn. Oğluma 100 dolar yolla"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant={listening ? "destructive" : "outline"}
                className="flex-1"
                disabled={!speechAvailable || busy}
                onClick={listening ? stopListening : startListening}
              >
                <MicIcon className="size-4" />
                {listening ? "Dinleniyor" : "Konuş"}
              </Button>
              <Button className="flex-1" disabled={busy || !input.trim()} onClick={() => sendCommand()}>
                {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
                Gönder
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
