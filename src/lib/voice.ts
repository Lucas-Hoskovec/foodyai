import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  onstart: (() => void) | null
}

interface UseVoiceOptions {
  lang?: string
  continuous?: boolean
  onFinal?: (text: string) => void
}

/** Reactive wrapper around the built-in Web Speech API (no external keys). */
export function useVoice(options: UseVoiceOptions = {}) {
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(
        (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
      ),
  )
  const [isListening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')

  const finalRef = useRef('')
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(options.onFinal)
  onFinalRef.current = options.onFinal

  useEffect(() => {
    if (!supported) return
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return

    const rec = new Ctor()
    rec.continuous = options.continuous ?? true
    rec.interimResults = true
    rec.lang = options.lang ?? 'en-US'

    rec.onresult = (event) => {
      let finalText = finalRef.current
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalText += result[0].transcript + ' '
        else interimText += result[0].transcript
      }
      finalRef.current = finalText
      setTranscript(`${finalText}${interimText}`.trim())
    }

    rec.onend = () => {
      setListening(false)
      const final = finalRef.current.trim()
      if (final) onFinalRef.current?.(final)
    }

    rec.onerror = () => {
      setListening(false)
    }

    recRef.current = rec
    return () => {
      rec.abort()
      recRef.current = null
    }
  }, [supported, options.lang, options.continuous])

  const start = useCallback(() => {
    const rec = recRef.current
    if (!rec || isListening) return
    finalRef.current = ''
    setTranscript('')
    setListening(true)
    try {
      rec.start()
    } catch {
      setListening(false)
    }
  }, [isListening])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  return { supported, isListening, transcript, start, stop }
}