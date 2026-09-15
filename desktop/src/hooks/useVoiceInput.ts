import { useState, useRef, useCallback, useEffect } from 'react'

export type VoiceStatus = 'idle' | 'listening' | 'error'

interface UseVoiceInputReturn {
  isSupported: boolean
  status: VoiceStatus
  interimTranscript: string
  finalTranscript: string
  error: string | null
  startListening: (lang?: string, autoRestart?: boolean) => void
  stopListening: () => string
  cancelAutoRestart: () => void
  resetTranscript: () => void
}

const RESTART_DEBOUNCE = 300

export function useVoiceInput(): UseVoiceInputReturn {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const finalRef = useRef('')
  const interimRef = useRef('')
  const isListeningRef = useRef(false)
  const autoRestartRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const langRef = useRef('en-US')

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const resetTranscript = useCallback(() => {
    setInterimTranscript('')
    setFinalTranscript('')
    finalRef.current = ''
    interimRef.current = ''
    setError(null)
  }, [])

  const cancelAutoRestart = useCallback(() => {
    isListeningRef.current = false
    autoRestartRef.current = false
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const startListening = useCallback((lang?: string, autoRestart?: boolean) => {
    if (!isSupported) {
      setError('Speech recognition not supported')
      return
    }

    cancelAutoRestart()
    isListeningRef.current = true
    autoRestartRef.current = autoRestart ?? false

    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }

    langRef.current = lang || 'en-US'

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = langRef.current

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalRef.current = (finalRef.current ? finalRef.current + ' ' : '') + transcript.trim()
          setFinalTranscript(finalRef.current)
        } else {
          interim += transcript
        }
      }
      interimRef.current = interim
      setInterimTranscript(interim)
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        if (isListeningRef.current) {
          return
        }
        setStatus('idle')
        if (autoRestartRef.current) {
          restartTimerRef.current = setTimeout(() => {
            if (autoRestartRef.current) {
              startListening(langRef.current, true)
            }
          }, RESTART_DEBOUNCE)
        }
      } else {
        isListeningRef.current = false
        setStatus('error')
        setError(event.error)
      }
    }

    recognition.onend = () => {
      if (isListeningRef.current) {
        try {
          recognition.start()
        } catch {
          restartTimerRef.current = setTimeout(() => {
            if (isListeningRef.current) {
              try {
                recognitionRef.current?.start()
              } catch {}
            }
          }, 150)
        }
        return
      }

      setStatus('idle')
      setInterimTranscript('')
      if (autoRestartRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (autoRestartRef.current) {
            startListening(langRef.current, true)
          }
        }, RESTART_DEBOUNCE)
      }
    }

    recognitionRef.current = recognition
    setStatus('listening')
    setError(null)
    finalRef.current = ''
    interimRef.current = ''
    setFinalTranscript('')
    setInterimTranscript('')

    try {
      recognition.start()
    } catch {
      isListeningRef.current = false
      setStatus('error')
      setError('Failed to start recognition')
    }
  }, [isSupported, cancelAutoRestart])

  const stopListening = useCallback((): string => {
    isListeningRef.current = false
    autoRestartRef.current = false
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
      recognitionRef.current = null
    }
    setStatus('idle')
    const finalPart = finalRef.current.trim()
    const interimPart = interimRef.current.trim()
    const combined = [finalPart, interimPart].filter(Boolean).join(' ')
    setInterimTranscript('')
    interimRef.current = ''
    return combined
  }, [])

  useEffect(() => {
    return () => {
      isListeningRef.current = false
      autoRestartRef.current = false
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current)
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch {}
      }
    }
  }, [])

  return { isSupported, status, interimTranscript, finalTranscript, error, startListening, stopListening, cancelAutoRestart, resetTranscript }
}