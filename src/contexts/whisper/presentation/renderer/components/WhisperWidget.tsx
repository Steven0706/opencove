import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Mic, Loader2, X } from 'lucide-react'

type Status = 'idle' | 'recording' | 'transcribing'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const CHUNK_SIZE = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE)
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return btoa(binary)
}

export function WhisperWidget(): JSX.Element {
  const [status, setStatus] = useState<Status>('idle')
  const [lastText, setLastText] = useState<string | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const [amplitude, setAmplitude] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  const stopAnalyser = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined)
      audioCtxRef.current = null
    }
    analyserRef.current = null
    setAmplitude(0)
  }, [])

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }
  }, [])

  const startAnalyser = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser

      const buffer = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteTimeDomainData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buffer.length)
        setAmplitude(Math.min(1, rms * 3))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      /* ignore */
    }
  }, [])

  const showToast = useCallback((text: string) => {
    setLastText(text)
    setToastVisible(true)
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false)
    }, 4000)
  }, [])

  const startRecording = useCallback(async () => {
    if (status !== 'idle') return
    cancelledRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        stopAnalyser()
        stopStream()

        if (cancelledRef.current) {
          chunksRef.current = []
          setStatus('idle')
          return
        }

        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []

        if (blob.size === 0) {
          setStatus('idle')
          return
        }

        setStatus('transcribing')
        try {
          const buffer = await blob.arrayBuffer()
          const base64 = arrayBufferToBase64(buffer)
          const result = await window.opencoveApi.whisper.transcribe({
            audioBase64: base64,
            filename: 'recording.webm',
          })
          const text = result.text.trim()
          if (text.length > 0) {
            try {
              await window.opencoveApi.clipboard.writeText(text)
            } catch {
              /* ignore clipboard failure */
            }
            showToast(text)
          } else {
            showToast('(no speech detected)')
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          showToast(`Transcription failed: ${msg}`)
        } finally {
          setStatus('idle')
        }
      }

      recorder.start()
      startAnalyser(stream)
      setStatus('recording')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      showToast(`Mic access failed: ${msg}`)
      setStatus('idle')
      stopStream()
    }
  }, [status, showToast, startAnalyser, stopAnalyser, stopStream])

  const stopRecording = useCallback(() => {
    if (status !== 'recording') return
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [status])

  const cancelRecording = useCallback(() => {
    if (status !== 'recording') return
    cancelledRef.current = true
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [status])

  useEffect(() => {
    return () => {
      stopAnalyser()
      stopStream()
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }
    }
  }, [stopAnalyser, stopStream])

  const handleClick = useCallback(() => {
    if (status === 'idle') {
      void startRecording()
    } else if (status === 'recording') {
      stopRecording()
    }
  }, [status, startRecording, stopRecording])

  const barHeights = [0.4, 0.7, 1.0, 0.7, 0.4].map(base =>
    Math.max(0.15, Math.min(1, base * (0.3 + amplitude * 1.5))),
  )

  return (
    <>
      <div className="whisper-widget" data-status={status}>
        {status === 'recording' ? (
          <button
            type="button"
            className="whisper-widget__cancel"
            onClick={cancelRecording}
            title="Cancel recording"
            aria-label="Cancel recording"
          >
            <X size={14} />
          </button>
        ) : null}
        <button
          type="button"
          className="whisper-widget__button"
          onClick={handleClick}
          disabled={status === 'transcribing'}
          title={
            status === 'recording'
              ? 'Stop and transcribe'
              : status === 'transcribing'
                ? 'Transcribing…'
                : 'Start voice input'
          }
          aria-label="Whisper voice input"
        >
          {status === 'transcribing' ? (
            <Loader2 size={18} className="whisper-widget__icon whisper-widget__icon--spinning" />
          ) : status === 'recording' ? (
            <div className="whisper-widget__bars" aria-hidden="true">
              {barHeights.map((h, i) => (
                <span
                  key={i}
                  className="whisper-widget__bar"
                  style={{ transform: `scaleY(${h})` }}
                />
              ))}
            </div>
          ) : (
            <Mic size={18} className="whisper-widget__icon" />
          )}
        </button>
      </div>
      {toastVisible && lastText ? (
        <div className="whisper-widget__toast" role="status">
          <div className="whisper-widget__toast-text">{lastText}</div>
          <div className="whisper-widget__toast-hint">Copied to clipboard</div>
        </div>
      ) : null}
    </>
  )
}
