import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, ImageUp, Loader2, RotateCcw, Send, VideoOff, X } from 'lucide-react'
import { cameraService } from '../../services'
import type { Attachment } from '../../types'

type Phase = 'loading' | 'live' | 'denied' | 'unavailable' | 'captured'
interface Props { open: boolean; onClose: () => void; onUse: (a: Attachment) => void }

export function CameraModal({ open, onClose, onUse }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [shot, setShot] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const stop = useCallback(() => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null }, [])

  const start = useCallback(async () => {
    setPhase('loading'); setShot(null)
    if (!navigator.mediaDevices?.getUserMedia) { setPhase('unavailable'); return }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      stream.current = s
      setPhase('live')
    } catch (e) {
      const name = (e as DOMException).name
      setPhase(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
    }
  }, [])

  useEffect(() => {
    if (open) { setFileError(null); void start() }
    return stop
  }, [open, start, stop])

  useEffect(() => {
    if (phase === 'live' && video.current && stream.current) { video.current.srcObject = stream.current; void video.current.play().catch(() => undefined) }
  }, [phase])

  const capture = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    c.toBlob(b => { if (b) { setBlob(b); setShot(URL.createObjectURL(b)); setPhase('captured'); stop() } }, 'image/jpeg', 0.9)
  }

  const onFile = (f: File | undefined) => {
    if (!f) return
    const err = cameraService.validate(f)
    if (err) { setFileError(err); return }
    setFileError(null); stop()
    setBlob(f); setShot(URL.createObjectURL(f)); setPhase('captured')
    if (fileInput.current) fileInput.current.value = ''
  }

  const use = () => { if (shot && blob) { onUse({ id: Math.random().toString(36).slice(2), name: 'appliance-photo', url: shot, source: blob instanceof File ? 'upload' : 'camera', file: blob }); onClose() } }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Show me the appliance">
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-line bg-bg-2 sm:rounded-3xl">
            <div className="flex items-center justify-between px-5 py-4">
              <div><h2 className="font-semibold">Show me the appliance</h2><p className="text-xs text-ink-2">Photos are uploaded to your repair session when you send them.</p></div>
              <button onClick={onClose} aria-label="Close camera" className="rounded-lg p-2 text-ink-2 hover:bg-surface"><X size={18} /></button>
            </div>
            <div className="relative mx-5 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-line bg-black">
              {phase === 'loading' && <div className="flex flex-col items-center gap-2 text-ink-2"><Loader2 className="animate-spin" /><span className="text-sm">Waiting for camera permission...</span></div>}
              {phase === 'live' && <video ref={video} playsInline muted className="h-full w-full object-cover" />}
              {phase === 'captured' && shot && <img src={shot} alt="Captured appliance preview" className="h-full w-full object-cover" />}
              {phase === 'denied' && <div role="alert" className="max-w-xs p-6 text-center"><VideoOff className="mx-auto mb-2 text-warn" /><p className="text-sm font-medium">Camera permission was denied</p><p className="mt-1 text-xs text-ink-2">Allow camera access in your browser settings and try again, or upload a photo instead.</p></div>}
              {phase === 'unavailable' && <div role="alert" className="max-w-xs p-6 text-center"><VideoOff className="mx-auto mb-2 text-warn" /><p className="text-sm font-medium">No camera available</p><p className="mt-1 text-xs text-ink-2">This device or browser cannot open a camera here. You can upload a photo instead.</p></div>}
            </div>
            {fileError && <p role="alert" className="mx-5 mt-3 rounded-xl border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{fileError}</p>}
            <div className="flex flex-wrap items-center justify-center gap-3 p-5">
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
              {phase === 'live' && <button onClick={capture} aria-label="Capture photo" className="fs-amber-bg flex h-14 w-14 items-center justify-center rounded-full text-bg ring-4 ring-white/10"><Camera /></button>}
              {phase === 'captured' && <>
                <button onClick={() => void start()} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-surface"><RotateCcw size={16} />Retake</button>
                <button onClick={use} className="fs-amber-bg inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-bg"><Send size={16} />Use this photo</button>
              </>}
              {(phase === 'denied' || phase === 'unavailable') && <button onClick={() => void start()} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-surface"><RotateCcw size={16} />Try camera again</button>}
              {phase !== 'captured' && <button onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-surface"><ImageUp size={16} />Upload from gallery</button>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
