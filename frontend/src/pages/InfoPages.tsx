import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bookmark, HandHelping, MessageSquareText } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusPill } from '../components/common/ui'
import { historyService } from '../services'
import { useAsync } from '../hooks/useAsync'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export function SavedDiagnoses() {
  const { data, loading, error, retry } = useAsync(() => historyService.diagnoses(), [])
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <PageHeader title="Saved Diagnoses" subtitle="AI diagnoses from your repair sessions." />
      {loading && <Skeleton className="h-40" />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {data && data.length === 0 && <EmptyState title="No diagnoses yet" hint="Run a diagnosis inside a repair session." />}
      <ul className="divide-y divide-line">
        {data?.map(d => <li key={d.id} className="flex items-start gap-3 py-4"><Bookmark size={18} className="mt-0.5 text-teal" /><div><p className="font-medium">{d.top_fault?.fault ?? d.problem_summary}</p><p className="text-sm text-ink-2">{d.problem_summary}</p><Link to={`/session/${d.session_id}`} className="mt-1 inline-block text-sm text-teal">{d.reference}: {d.title}</Link></div></li>)}
      </ul>
    </div>
  )
}

export function SeniorSupport() {
  const { user } = useAuth()
  const isManager = user?.role === 'manager' || user?.role === 'admin'
  const [v, setV] = useState(0)
  const { data, loading, error, retry } = useAsync(() => historyService.escalations(), [v])
  const update = async (id: string, status: string) => { await historyService.updateEscalation(id, status); setV(x => x + 1) }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <PageHeader title="Senior Technician Support" subtitle={isManager ? 'Escalations from your team.' : 'Your requests for senior help.'} />
      {loading && <Skeleton className="h-40" />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {data && data.length === 0 && <EmptyState title="No escalations" hint="Ask a senior technician from inside a repair session." />}
      <ul className="divide-y divide-line">
        {data?.map(e => (
          <li key={e.id} className="py-4">
            <div className="flex flex-wrap items-center gap-2"><HandHelping size={16} className="text-warn" /><Link to={`/session/${e.session_id}`} className="font-medium hover:text-teal">{e.session_reference}</Link><StatusPill status={e.status} /><span className="text-xs text-ink-3">{e.technician} · {new Date(e.created_at).toLocaleString()}</span></div>
            <p className="mt-1 text-sm">{e.reason}</p>
            {e.diagnosis_summary && <p className="text-sm text-ink-2">Diagnosis: {e.diagnosis_summary}</p>}
            {isManager && e.status !== 'resolved' && <div className="mt-2 flex gap-2">{e.status === 'open' && <button onClick={() => void update(e.id, 'in_review')} className="rounded-lg border border-line px-3 py-1 text-xs hover:bg-surface">Mark in review</button>}<button onClick={() => void update(e.id, 'resolved')} className="rounded-lg border border-ok/40 px-3 py-1 text-xs text-ok hover:bg-ok/10">Mark resolved</button></div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HelpPage() {
  const nav = useNavigate()
  const { newSession } = useApp()
  const faq = [
    ['What does FixSaathi do?', 'It guides you through a repair by chat or live voice and camera, ranks likely faults, marks parts on your photos, and writes the service report.'],
    ['Does it verify that power is off?', 'No. The safety checkboxes record your own statements. The server keeps power-sensitive steps locked until you record both, but only your tester can confirm a circuit is dead.'],
    ['Where do my photos go?', 'Photos you send are stored privately with your repair session on the FixSaathi server. Live video frames are not stored, except a single frame when the AI marks a part.'],
    ['Are AI answers always right?', 'No. Confidence values are AI estimates. Check every step and ask a senior technician when unsure.'],
  ]
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
      <PageHeader title="Help and Support" />
      <div className="divide-y divide-line border-y border-line">{faq.map(([q, a]) => <details key={q} className="group py-4"><summary className="cursor-pointer list-none font-medium marker:hidden">{q}</summary><p className="mt-2 text-sm text-ink-2">{a}</p></details>)}</div>
      <button onClick={() => { newSession(); nav('/assistant') }} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-surface"><MessageSquareText size={16} />Ask the assistant</button>
    </div>
  )
}

export function NotFound() {
  return <div className="py-24 text-center"><p className="text-xl font-semibold">Page not found</p><Link to="/" className="mt-3 inline-block text-teal">Go home</Link></div>
}
