import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Camera, ImagePlus, Loader2, Mic, X } from 'lucide-react'
import { CameraModal } from '../camera/CameraModal'
import { cameraService } from '../../services'
import type { Attachment } from '../../types'

interface Props { onSend: (text: string, attachments: Attachment[]) => void; disabled?: boolean; autoFocus?: boolean; initial?: string; compact?: boolean }

export function Composer({ onSend, disabled, autoFocus, compact }: Props) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [camera, setCamera] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const nav = useNavigate()
  const canSend = !disabled && (text.trim().length > 0 || files.length > 0)

  // Grow with the text up to a limit, like a modern chat box.
  useEffect(() => {
    const el = area.current; if (!el) return
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    onSend(text, files); setText(''); setFiles([]); setError(null)
  }
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }
  const pick = (f: File | undefined) => {
    if (!f) return
    const err = cameraService.validate(f)
    if (err) { setError(err); return }
    setError(null); setFiles(a => [...a, { id: Math.random().toString(36).slice(2), name: f.name, url: URL.createObjectURL(f), source: 'upload', file: f }])
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <>
      <div className={`fs-border-grad w-full rounded-[26px] p-px transition-shadow ${compact ? 'shadow-[0_14px_40px_-24px_rgba(45,212,191,.5)]' : 'shadow-[0_24px_70px_-30px_rgba(45,212,191,.55)]'} focus-within:shadow-[0_20px_70px_-22px_rgba(255,159,67,.45)]`}>
        <form onSubmit={submit} className="w-full rounded-[25px] bg-[#0b1220]/95 p-2.5 backdrop-blur-xl">
          {files.length > 0 && (
            <ul className="mb-1 flex flex-wrap gap-2 px-1.5 pt-1" aria-label="Attached images">
              {files.map(f => (
                <li key={f.id} className="relative">
                  <img src={f.url} alt={`Attachment ${f.name}`} className="h-16 w-16 rounded-xl border border-line object-cover" />
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(a => a.filter(x => x.id !== f.id))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-ink ring-1 ring-line-2 hover:bg-crit"><X size={11} /></button>
                </li>
              ))}
            </ul>
          )}
          <label className="sr-only" htmlFor="composer-input">Describe the appliance issue</label>
          <textarea id="composer-input" ref={area} maxLength={4000} value={text} onChange={e => setText(e.target.value)} onKeyDown={key} autoFocus={autoFocus} rows={compact ? 1 : 2}
            placeholder={compact ? 'Ask a follow-up, report a check result, or describe a new fault...' : 'Describe the fault, e.g. "LG split AC showing CH38, not cooling"'}
            className="block max-h-[200px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3" />
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center">
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
              <button type="button" aria-label="Upload an image" title="Upload an image" onClick={() => fileInput.current?.click()} className="icon-btn"><ImagePlus size={19} /></button>
              <button type="button" aria-label="Show me the appliance (camera)" title="Show me the appliance" onClick={() => setCamera(true)} className="icon-btn"><Camera size={19} /></button>
              <span className="ml-2 hidden text-[11px] text-ink-3 lg:inline">Enter to send · Shift+Enter for a new line</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Start voice conversation" title="Start voice conversation" onClick={() => nav('/voice')} className="inline-flex h-10 items-center gap-2 rounded-full border border-teal/35 bg-teal/[0.08] px-4 text-sm font-medium text-ink transition-colors hover:bg-teal/15"><Mic size={17} className="text-teal" />Voice</button>
              <button type="submit" disabled={!canSend} aria-label="Send" className="fs-amber-bg flex h-10 w-10 items-center justify-center rounded-full text-[#1a0e02] shadow-[0_8px_22px_-8px_rgba(255,138,43,.85)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
                {disabled && (text.trim() || files.length) ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} strokeWidth={2.4} />}
              </button>
            </div>
          </div>
        </form>
      </div>
      {error && <p role="alert" className="mt-2 rounded-xl border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}
      <CameraModal open={camera} onClose={() => setCamera(false)} onUse={a => setFiles(x => [...x, a])} />
    </>
  )
}
