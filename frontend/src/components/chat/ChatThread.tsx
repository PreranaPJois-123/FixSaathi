import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, PlayCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Emblem } from '../common/Logo'
import { useApp } from '../../context/AppContext'
import type { ChatMessage } from '../../types'
import { SourceList } from '../common/SourceList'
import { AuthImage } from '../common/AuthImage'

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === 'system') {
    return (
      <div role="status" className="mx-auto flex max-w-xl items-start gap-2 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          {m.notice === 'ai_unavailable' ? `AI is not available: ${m.text}` : `The AI could not reply: ${m.text}`} Your message was saved.
          {m.hint && <span className="mt-1 block text-xs text-ink-2">Fix: {m.hint}{m.errorCode ? ` (${m.errorCode})` : ''}</span>}
          <Link to="/demo" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-teal hover:underline"><PlayCircle size={13} />Show the product with a labelled demo scenario instead</Link>
        </span>
      </div>
    )
  }
  const mine = m.role === 'user'
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface sm:flex"><Emblem height={20} /></div>}
      <div className={`flex max-w-[85%] flex-col sm:max-w-[75%] ${mine ? 'items-end' : 'items-start'}`}>
        {m.attachments && m.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">{m.attachments.map(a => a.server ? <AuthImage key={a.id} src={a.url} alt="Attached appliance" className="h-28 w-28 overflow-hidden rounded-2xl border border-line" /> : <img key={a.id} src={a.url} alt="Attached appliance" className="h-28 w-28 rounded-2xl border border-line object-cover" />)}</div>
        )}
        {m.text && <div className={`whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${mine ? 'rounded-br-lg bg-surface-2 text-ink' : 'rounded-bl-lg border border-line bg-surface/60 text-ink'}`}>{m.text}</div>}
        <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-ink-3">
          <span>{time(m.at)}</span>
          {m.demo && <span className="rounded-full border border-warn/50 bg-warn/10 px-2 py-px font-medium text-warn">Demo scenario: scripted sample, not live AI</span>}
          {m.aiGenerated && <span className="inline-flex items-center gap-1"><Sparkles size={11} />AI-generated, check before acting</span>}
        </div>
        {m.sources && m.sources.length > 0 && <SourceList sources={m.sources} />}
      </div>
    </motion.div>
  )
}

function ThinkingLabel() {
  const [t, setT] = useState(0)
  useEffect(() => { const id = setInterval(() => setT(x => x + 1), 1000); return () => clearInterval(id) }, [])
  const phase = t < 3 ? 'Reading your message' : t < 8 ? 'Checking the repair knowledge base' : t < 20 ? 'Gemini is working on the answer' : 'Still working, Gemini is busy'
  return <span className="text-sm text-ink-2 tabular-nums">{phase}... <span className="text-ink-3">{t}s</span></span>
}

export function ChatThread() {
  const { messages, thinking, error } = useApp()
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages.length, thinking])
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map(m => <Bubble key={m.id} m={m} />)}
      {thinking && (
        <div className="flex items-center gap-3" aria-label="FixSaathi is thinking">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"><Emblem height={20} /></div>
          <div className="flex items-center gap-3 rounded-3xl border border-line bg-surface/40 px-4 py-3">
            <span className="flex items-center gap-1.5">{[0, 1, 2].map(i => <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-teal" style={{ animationDelay: `${i * 0.18}s` }} />)}</span>
            <ThinkingLabel />
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-2xl border border-crit/40 bg-crit/10 px-4 py-3 text-sm text-crit">{error}</p>}
      <div ref={end} />
    </div>
  )
}
