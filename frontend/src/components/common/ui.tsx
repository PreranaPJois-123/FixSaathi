import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export function DemoBadge({ children = 'Sample data' }: { children?: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-[11px] font-medium text-warn">{children}</span>
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'text-ok bg-ok/10 border-ok/30', resolved: 'text-ok bg-ok/10 border-ok/30',
    escalated: 'text-warn bg-warn/10 border-warn/30', awaiting_confirmation: 'text-warn bg-warn/10 border-warn/30', open: 'text-warn bg-warn/10 border-warn/30',
    cancelled: 'text-ink-3 border-line', not_resolved: 'text-crit bg-crit/10 border-crit/30',
  }
  const label = status.replace(/_/g, ' ')
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] ?? 'text-teal bg-teal/10 border-teal/30'}`}>{label}</span>
}

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} aria-hidden /> }

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
      <AlertTriangle className="text-warn" />
      <p className="text-ink-2">{message}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm hover:bg-surface"><RefreshCw size={14} />Try again</button>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return <div className="py-16 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-ink-2">{hint}</p></div>
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}</div>
      {right}
    </header>
  )
}
