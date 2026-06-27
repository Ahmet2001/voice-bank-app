import "server-only"

import { runBankCommand } from "@/lib/sandbox-bank/store"
import type { BankAgentResult } from "@/lib/sandbox-bank/types"

type GroqChoice = {
  message?: {
    content?: string
  }
}

type GroqResponse = {
  choices?: GroqChoice[]
}

type GroqPlan = {
  command?: string
  canonicalCommand?: string
  note?: string
}

function extractJson(value: string): GroqPlan | null {
  try {
    return JSON.parse(value) as GroqPlan
  } catch {
    const match = value.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as GroqPlan
    } catch {
      return null
    }
  }
}

function preserveCurrency(original: string, command: string) {
  const source = original.toLocaleLowerCase("tr-TR")
  const target = command.toLocaleLowerCase("tr-TR")
  if (/\b(tl|try|lira)\b/.test(source) && !/\b(tl|try|lira)\b/.test(target)) return `${command} lira`
  if (/\b(usd|dolar|dollar)\b/.test(source) && !/\b(usd|dolar|dollar)\b/.test(target)) return `${command} dolar`
  if (/\b(eur|euro|avro)\b/.test(source) && !/\b(eur|euro|avro)\b/.test(target)) return `${command} euro`
  return command
}

export async function runGroqBankCommand(userText: string): Promise<BankAgentResult | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"
  const baseUrl = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1"

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are VoiceBank's Turkish banking command router. Return only JSON. " +
              "Never approve or mutate money yourself. Convert the user's utterance into one safe Turkish sandbox banking command. " +
              "Available contacts and aliases: oğlum/Deniz, çocuk/Zeynep, anne/Ayşe, baba/Mehmet, amca/Kemal, eşim/Elif, kira/Murat, okul/Northstar. " +
              "Available actions: transfer, balance, card freeze/open, market/portfolio query, buy/sell trade. " +
              "For mutation requests produce a command that still requires confirmation. JSON schema: {\"command\":\"...\",\"note\":\"...\"}.",
          },
          {
            role: "user",
            content: userText,
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    })

    if (!response.ok) return null

    const payload = (await response.json()) as GroqResponse
    const content = payload.choices?.[0]?.message?.content
    if (!content) return null

    const plan = extractJson(content)
    const command = preserveCurrency(userText, (plan?.command ?? plan?.canonicalCommand ?? "").trim())
    if (!command) return null

    const result = await runBankCommand(command)
    const stamp = result.state.updatedAt

    return {
      ...result,
      events: [
        { type: "bank.tool_progress", label: "Groq agent", detail: `${model}: ${command}` },
        ...result.events,
      ],
      transcript: [
        { role: "user", text: userText, at: stamp },
        { role: "assistant", text: result.message, at: stamp },
      ],
    }
  } catch {
    return null
  }
}
