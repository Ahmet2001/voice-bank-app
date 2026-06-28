import "server-only"

export type LocalAgentRole =
  | "orchestrator"
  | "researcher"
  | "professor"
  | "poet"
  | "finance_analyst"
  | "compliance"
  | "fraud_risk"
  | "judge"

export type LocalMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type OllamaChatResponse = {
  message?: {
    content?: string
    thinking?: string
  }
  error?: string
}

export type LocalQwenResult = {
  content: string
  thinking?: string
}

type CallQwenParams = {
  role: LocalAgentRole
  messages: LocalMessage[]
  temperature?: number
  json?: boolean
  onChunk?: (chunk: string, isThinking: boolean) => void
}

export async function callQwenAgent(params: CallQwenParams): Promise<string> {
  return (await callQwenAgentDetailed(params)).content
}

export async function callQwenAgentDetailed(params: CallQwenParams): Promise<LocalQwenResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b"

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: params.messages,
        stream: !!params.onChunk,
        options: {
          temperature: params.temperature ?? 0.2,
        },
        format: params.json ? "json" : undefined,
      }),
      signal: AbortSignal.timeout(90000), // Increased timeout to 90s for long prompts
      cache: "no-store",
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`)
    }

    if (params.onChunk) {
      const reader = response.body?.getReader()
      if (!reader) throw new Error("Stream body not available")
      const decoder = new TextDecoder("utf-8")
      let fullResponse = params.messages.find(m => m.role === "assistant")?.content || ""
      let isThinking = fullResponse.includes("<think>")

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunkStr = decoder.decode(value, { stream: true })
        const lines = chunkStr.split("\n")
        
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line) as OllamaChatResponse
            if (parsed.message?.content) {
              const contentChunk = parsed.message.content
              fullResponse += contentChunk
              if (fullResponse.includes("<think>") && !fullResponse.includes("</think>")) {
                isThinking = true
              } else if (fullResponse.includes("</think>")) {
                isThinking = false
              }
              params.onChunk(contentChunk, isThinking)
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      const thinkingEnd = fullResponse.indexOf("</think>")
      let thinkingText = undefined
      let finalContent = fullResponse
      
      if (fullResponse.includes("<think>") && thinkingEnd !== -1) {
          thinkingText = fullResponse.substring(fullResponse.indexOf("<think>") + 7, thinkingEnd).trim()
          finalContent = fullResponse.substring(thinkingEnd + 9).trim()
      }

      return {
        content: finalContent,
        thinking: thinkingText,
      }
    }

    const payload = (await response.json()) as OllamaChatResponse
    const content = payload.message?.content
    if (!content) {
      throw new Error(payload.error ?? "Ollama response did not include message.content")
    }

    return {
      content,
      thinking: payload.message?.thinking,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Ollama error"
    throw new Error(
      `Local Qwen agent '${params.role}' failed. Make sure Ollama is running at ${baseUrl} and model '${model}' is available. ${detail}`
    )
  }
}

export function extractJson<T>(value: string): T | null {
  const withoutThink = value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  const candidates = [
    withoutThink,
    withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
    withoutThink.match(/\{[\s\S]*\}/)?.[0],
    withoutThink.match(/\[[\s\S]*\]/)?.[0],
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T
    } catch {
      // Try the next extraction shape.
    }
  }

  return null
}

export function safeThinkingSummary(role: LocalAgentRole, thinking?: string): string | undefined {
  if (!thinking?.trim()) return undefined

  const normalized = thinking.toLocaleLowerCase("tr-TR")
  const signals = [
    normalized.includes("risk") || normalized.includes("onay") ? "risk ve onay gerekliliği" : undefined,
    normalized.includes("json") || normalized.includes("schema") ? "beklenen çıktı şeması" : undefined,
    normalized.includes("context") || normalized.includes("bağlam") ? "bankacılık bağlamı" : undefined,
    normalized.includes("turkish") || normalized.includes("türk") ? "Türkçe kullanıcı yanıtı" : undefined,
    normalized.includes("calculation") || normalized.includes("hesap") ? "sayısal kontrol" : undefined,
  ].filter((signal): signal is string => Boolean(signal))

  const focus = signals.length ? signals.slice(0, 3).join(", ") : "görev güvenliği ve tutarlılık"
  return `Qwen3 thinking aktif. ${role} ajanı final yanıttan önce ${focus} üzerinde iç muhakeme yaptı. Ham düşünce zinciri gösterilmez; bu güvenli özettir.`
}
