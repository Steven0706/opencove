import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Mic, Loader2, History, ArrowLeft, Copy, Check } from 'lucide-react'
import type { WhisperHistoryItem } from '../../../../../shared/contracts/dto/whisper'

type WidgetState = 'idle' | 'recording' | 'processing' | 'history'

export function WhisperWidget(): JSX.Element {
  const [state, setState] = useState<WidgetState>('idle')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<WhisperHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyCopiedIndex, setHistoryCopiedIndex] = useState<number | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number>(0)
  const isRecordingRef = useRef(false)
  const mimeTypeRef = useRef('audio/webm')

  const drawWaveform = useCallback(() => {
    if (!isRecordingRef.current) return
    const analyser = analyserRef.current
    const canvas = canvasRef.current
    if (!analyser || !canvas) {
      animFrameRef.current = requestAnimationFrame(drawWaveform)
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const bufferLength = analyser.fftSize
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteTimeDomainData(dataArray)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ef4444'
    ctx.beginPath()
    const sliceWidth = canvas.width / bufferLength
    let x = 0
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0
      const y = (v * canvas.height) / 2
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      x += sliceWidth
    }
    ctx.lineTo(canvas.width, canvas.height / 2)
    ctx.stroke()
    animFrameRef.current = requestAnimationFrame(drawWaveform)
  }, [])

  const stopAndTranscribe = useCallback(() => {
    isRecordingRef.current = false
    cancelAnimationFrame(animFrameRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
      analyserRef.current = null
    }
  }, [])

  const handleRecordingComplete = useCallback(async () => {
    setState('processing')
    const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current })
    if (blob.size === 0) {
      setErrorDetail('No audio')
      setState('idle')
      return
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        const ci = dataUrl.indexOf(',')
        resolve(ci >= 0 ? dataUrl.substring(ci + 1) : dataUrl)
      }
      reader.onerror = () => reject(new Error('read failed'))
      reader.readAsDataURL(blob)
    })
    const ext = mimeTypeRef.current.includes('ogg') ? 'ogg' : 'webm'
    try {
      const result = await window.opencoveApi.whisper.transcribe({
        audioBase64: base64,
        filename: `recording-${Date.now()}.${ext}`,
      })
      if (result.success && result.text) {
        await window.opencoveApi.clipboard.writeText(result.text)
      }
      setErrorDetail(null)
    } catch (err) {
      setErrorDetail(`${err instanceof Error ? err.message : 'Failed'}`)
    }
    setState('idle')
  }, [])

  // Toggle: click to start, click again to stop
  const handleMicToggle = useCallback(async () => {
    if (state === 'recording') {
      stopAndTranscribe()
      return
    }
    try {
      setErrorDetail(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      let mimeType = 'audio/webm'
      for (const c of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
        if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break }
      }
      mimeTypeRef.current = mimeType

      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      recorder.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = () => { void handleRecordingComplete() }
      recorder.start(250)
      mediaRecorderRef.current = recorder
      isRecordingRef.current = true
      setState('recording')
      requestAnimationFrame(() => drawWaveform())
    } catch (err) {
      setErrorDetail(`Mic: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [state, drawWaveform, stopAndTranscribe, handleRecordingComplete])

  const handleHistory = useCallback(async () => {
    setHistoryLoading(true)
    setState('history')
    setHistoryCopiedIndex(null)
    try {
      const auth = await window.opencoveApi.whisper.auth()
      const hist = await window.opencoveApi.whisper.history({ token: auth.token })
      setHistoryItems(hist.items)
    } catch { setHistoryItems([]) }
    finally { setHistoryLoading(false) }
  }, [])

  const handleHistoryCopy = useCallback(async (text: string, i: number) => {
    await window.opencoveApi.clipboard.writeText(text)
    setHistoryCopiedIndex(i)
    setTimeout(() => setHistoryCopiedIndex(null), 1500)
  }, [])

  useEffect(() => {
    return () => {
      isRecordingRef.current = false
      cancelAnimationFrame(animFrameRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (audioContextRef.current) void audioContextRef.current.close()
    }
  }, [])

  return (
    <div className="whisper-widget">
      {(state === 'idle' || state === 'recording') && (
        <div className="whisper-widget__main">
          {state === 'recording' && (
            <canvas ref={canvasRef} className="whisper-widget__waveform" width={120} height={32} />
          )}
          <button
            type="button"
            className={`whisper-widget__mic-btn ${state === 'recording' ? 'whisper-widget__mic-btn--active' : ''}`}
            onClick={() => void handleMicToggle()}
            title={state === 'recording' ? 'Stop & copy to clipboard' : 'Start recording'}
          >
            <Mic size={16} />
          </button>
          {state === 'idle' && (
            <button type="button" className="whisper-widget__history-btn" onClick={() => void handleHistory()} title="History">
              <History size={14} />
            </button>
          )}
        </div>
      )}

      {state === 'processing' && (
        <div className="whisper-widget__processing">
          <Loader2 size={16} className="whisper-widget__spinner" />
        </div>
      )}

      {errorDetail && state === 'idle' && (
        <div className="whisper-widget__error" title={errorDetail}>!</div>
      )}

      {state === 'history' && (
        <div className="whisper-widget__history">
          <button type="button" className="whisper-widget__history-back-btn" onClick={() => setState('idle')} title="Back">
            <ArrowLeft size={14} />
          </button>
          {historyLoading ? (
            <Loader2 size={14} className="whisper-widget__spinner" />
          ) : historyItems.length === 0 ? (
            <span className="whisper-widget__label">No history</span>
          ) : (
            <div className="whisper-widget__history-list">
              {historyItems.map((item, i) => (
                <div key={i} className="whisper-widget__history-item">
                  <span className="whisper-widget__history-text" title={item.text}>
                    {item.text.length > 50 ? item.text.slice(0, 50) + '...' : item.text}
                  </span>
                  <button type="button" className="whisper-widget__copy-btn" onClick={() => void handleHistoryCopy(item.text, i)}>
                    {historyCopiedIndex === i ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
