import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Camera, ImagePlus, Mic, X } from 'lucide-react'
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
  const nav = useNavigate()
  const canSend = !disabled && (text.trim().length > 0 || files.length > 0)

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    onSend(text, files); setText(''); setFiles([]); setError(null)
  }
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }
  const pick = (f: File | undefined) => {
    if (!f) return
    const err = cameraService.validate(f)
    if (err) { setError(err); return }
    setError(null); setFiles(a => [...a, { id: Math.random().toString(36).slice(2), name: f.name, url: URL.createObjectURL(f), source: 'upload', file: f }])
    if (fileInput.current) fileInput.current.value = ''
  }

  const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink'
  return (
    <>
      <div className="fs-border-grad w-full rounded-[29px] p-[1.5px] shadow-[0_18px_50px_-22px_rgba(47,196,176,0.45)] transition-shadow focus-within:shadow-[0_18px_60px_-18px_rgba(255,157,61,0.5)]">
      <form onSubmit={submit} className="w-full rounded-[28px] bg-[#0a1d33]/95 p-3">
        {files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2 px-1" aria-label="Attached images">
            {files.map(f => (
              <li key={f.id} className="relative">
                <img src={f.url} alt={`Attachment ${f.name}`} className="h-16 w-16 rounded-xl border border-line object-cover" />
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(a => a.filter(x => x.id !== f.id))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg-2 text-ink ring-1 ring-line"><X size={11} /></button>
              </li>
            ))}
          </ul>
        )}
        <label className="sr-only" htmlFor="composer-input">Describe the appliance issue</label>
        <textarea id="composer-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={key} autoFocus={autoFocus} rows={compact ? 1 : 2} placeholder="Describe the appliance issue or ask FixSaathi..." className="max-h-40 w-full resize-none bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-ink-3" />
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
            <button type="button" aria-label="Upload an image" title="Upload an image" onClick={() => fileInput.current?.click()} className={iconBtn}><ImagePlus size={20} /></button>
            <button type="button" aria-label="Show me the appliance (camera)" title="Show me the appliance" onClick={() => setCamera(true)} className={iconBtn}><Camera size={20} /></button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Start voice conversation" title="Start voice conversation" onClick={() => nav('/voice')} className="flex h-10 items-center gap-2 rounded-full border border-teal/40 bg-teal/10 px-4 text-sm text-ink hover:bg-teal/20"><Mic size={18} className="text-teal" />Voice</button>
            <button type="submit" disabled={!canSend} aria-label="Send" className="fs-amber-bg flex h-10 w-10 items-center justify-center rounded-full text-bg shadow-[0_6px_20px_-6px_rgba(255,157,61,0.8)] transition-opacity disabled:cursor-not-allowed disabled:opacity-75"><ArrowUp size={20} /></button>
          </div>
        </div>
      </form>
      </div>
      {error && <p role="alert" className="mt-2 rounded-xl border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}
      <CameraModal open={camera} onClose={() => setCamera(false)} onUse={a => setFiles(x => [...x, a])} />
    </>
  )
}
