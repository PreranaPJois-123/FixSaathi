import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../services/api'
import { cameraService, chatService, sessionService } from '../services'
import type { Attachment, ChatMessage, ServerMessage, SourceRef } from '../types'

interface Ctx {
  collapsed: boolean
  toggleCollapsed: () => void
  sessionId: string | null
  messages: ChatMessage[]
  thinking: boolean
  error: string | null
  sessionsVersion: number
  send: (text: string, attachments?: Attachment[], appliance?: string) => Promise<void>
  openSession: (id: string) => Promise<void>
  newSession: () => void
}
const AppCtx = createContext<Ctx | null>(null)
const uid = () => Math.random().toString(36).slice(2, 10)

export const toChat = (m: ServerMessage): ChatMessage => ({
  id: m.id, role: m.role, text: m.message, at: new Date(m.created_at).getTime(), aiGenerated: m.meta?.ai_generated === true,
  sources: (m.meta?.sources as SourceRef[] | undefined) ?? [],
})

export function AppProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionsVersion, setSessionsVersion] = useState(0)
  const busy = useRef(false)
  const sid = useRef<string | null>(null)

  const openSession = useCallback(async (id: string) => {
    sid.current = id; setSessionId(id); setError(null)
    try { setMessages((await chatService.history(id)).items.map(toChat)) } catch (e) { setError((e as ApiError).message) }
  }, [])

  const send = useCallback(async (text: string, attachments: Attachment[] = [], appliance?: string) => {
    if (busy.current || (!text.trim() && attachments.length === 0)) return
    busy.current = true; setError(null)
    const localId = uid()
    setMessages(m => [...m, { id: localId, role: 'user', text: text.trim(), at: Date.now(), attachments: attachments.map(a => ({ id: a.id, url: a.url })) }])
    setThinking(true)
    try {
      if (!sid.current) {
        const s = await sessionService.create(text.trim() || 'Photo shared', appliance)
        sid.current = s.id; setSessionId(s.id); setSessionsVersion(v => v + 1)
      }
      const ids: string[] = []
      for (const a of attachments) ids.push((await cameraService.upload(sid.current, a.file, a.source === 'camera' ? 'capture' : 'upload')).id)
      const r = await chatService.send(sid.current, text.trim(), ids)
      setMessages(m => {
        const next = m.map(x => x.id === localId ? { ...x, id: r.user_message.id } : x)
        if (r.assistant_message) next.push(toChat(r.assistant_message))
        else next.push({ id: uid(), role: 'system', at: Date.now(), notice: r.ai_status === 'unavailable' ? 'ai_unavailable' : 'ai_error',
          text: r.ai_error?.message || 'The AI could not reply.', hint: r.ai_error?.hint, errorCode: r.ai_error?.code })
        return next
      })
    } catch (e) {
      setError((e as ApiError).message || 'Something went wrong.')
    } finally { setThinking(false); busy.current = false }
  }, [])

  const newSession = useCallback(() => { sid.current = null; setSessionId(null); setMessages([]); setThinking(false); setError(null) }, [])

  const value = useMemo<Ctx>(() => ({ collapsed, toggleCollapsed: () => setCollapsed(c => !c), sessionId, messages, thinking, error, sessionsVersion, send, openSession, newSession }),
    [collapsed, sessionId, messages, thinking, error, sessionsVersion, send, openSession, newSession])
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp() {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp must be used inside AppProvider')
  return c
}
