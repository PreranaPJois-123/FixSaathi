import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusPill } from '../components/common/ui'
import { historyService } from '../services'
import { useAsync } from '../hooks/useAsync'

export default function RepairHistoryPage({ mine = false }: { mine?: boolean }) {
  const { data, loading, error, retry } = useAsync(() => historyService.list(mine), [mine])
  const rows = data?.items
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <PageHeader title={mine ? 'My Repairs' : 'Repair History'} subtitle={mine ? 'Repairs that are still open or escalated.' : 'Repair sessions you are allowed to see.'} />
      {loading && <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}</div>}
      {error && <ErrorState message={error} onRetry={retry} />}
      {rows && rows.length === 0 && <EmptyState title={mine ? 'Nothing open right now' : 'No repairs yet'} hint="Start a new repair session from the home screen." />}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-ink-3"><tr>{['Appliance', 'Session', 'Started', 'Technician', 'Issue', 'Status', ''].map(h => <th key={h} className="border-b border-line px-3 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-line/60 hover:bg-surface/50">
                  <td className="px-3 py-4 font-medium">{r.appliance_label}</td>
                  <td className="px-3 py-4 text-ink-2"><Link className="hover:text-teal" to={`/session/${r.id}`}>{r.reference}</Link></td>
                  <td className="px-3 py-4 text-ink-2">{new Date(r.started_at).toLocaleDateString()}</td>
                  <td className="px-3 py-4 text-ink-2">{r.technician_name}</td>
                  <td className="max-w-[260px] truncate px-3 py-4 text-ink-2">{r.title}</td>
                  <td className="px-3 py-4"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-4 text-right">{r.report_id ? <Link to={`/reports/${r.report_id}`} className="inline-flex items-center gap-1 text-teal">Report<ChevronRight size={14} /></Link> : <Link to={`/session/${r.id}`} className="inline-flex items-center gap-1 text-teal">Open<ChevronRight size={14} /></Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
