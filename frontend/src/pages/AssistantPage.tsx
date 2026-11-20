import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mic, Plus, Wrench } from 'lucide-react'
import { ChatThread } from '../components/chat/ChatThread'
import { Composer } from '../components/composer/Composer'
import { useApp } from '../context/AppContext'
import { suggestions } from '../constants/prompts'

export default function AssistantPage() {
  const { messages, send, thinking, newSession, sessionId, openSession } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const want = params.get('session')
  useEffect(() => { if (want && want !== sessionId) void openSession(want) }, [want, sessionId, openSession])
  return (
    <div className="flex h-full min-h-[calc(100dvh-8rem)] flex-col md:min-h-dvh">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {messages.length === 0 && !thinking ? (
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
            <h1 className="text-2xl font-semibold">AI Assistant</h1>
            <p className="text-ink-2">Start a conversation about an appliance fault.</p>
            <div className="flex flex-wrap justify-center gap-2">{suggestions.map(s => <button key={s.label} onClick={() => void send(s.prompt)} className="rounded-full border border-white/30 px-4 py-2 text-sm text-ink hover:border-teal hover:bg-teal/10">{s.label}</button>)}</div>
          </div>
        ) : <ChatThread />}
      </div>
      <div className="sticky bottom-0 border-t border-line/60 bg-bg/95 px-4 pb-4 pt-3 backdrop-blur" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-2 flex flex-wrap justify-end gap-2">
            {sessionId && <button onClick={() => nav(`/session/${sessionId}`)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-ink-2 hover:bg-surface"><Wrench size={12} />Open repair workspace</button>}
            {sessionId && <button onClick={() => nav(`/voice?session=${sessionId}`)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-ink-2 hover:bg-surface"><Mic size={12} />Continue by voice</button>}
            <button onClick={() => { newSession(); nav('/') }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-ink-2 hover:bg-surface"><Plus size={12} />New session</button>
          </div>
          <Composer compact disabled={thinking} onSend={(t, a) => void send(t, a)} />
        </div>
      </div>
    </div>
  )
}
