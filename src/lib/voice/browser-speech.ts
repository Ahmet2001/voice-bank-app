"use client"

function waitForVoices() {
  if (!("speechSynthesis" in window)) return Promise.resolve<SpeechSynthesisVoice[]>([])

  const voices = window.speechSynthesis.getVoices()
  if (voices.length) return Promise.resolve(voices)

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const timer = window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000)
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timer)
      resolve(window.speechSynthesis.getVoices())
    }
  })
}

export async function speakTurkish(text: string) {
  if (!("speechSynthesis" in window)) return false

  const voices = await waitForVoices()
  const voice =
    voices.find((item) => item.lang.toLocaleLowerCase("tr-TR").startsWith("tr")) ??
    voices.find((item) => item.name.toLocaleLowerCase("tr-TR").includes("turkish"))

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = "tr-TR"
  utterance.rate = 0.96
  utterance.pitch = 1
  if (voice) utterance.voice = voice

  window.speechSynthesis.speak(utterance)
  window.setTimeout(() => window.speechSynthesis.resume(), 0)
  return true
}

export function stopTurkishSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel()
}
