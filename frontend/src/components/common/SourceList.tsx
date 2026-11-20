import { BookOpen } from 'lucide-react'
import type { SourceRef } from '../../types'

const STATUS: Record<string, string> = { verified_source: 'manufacturer-listed source', technician_reviewed: 'technician reviewed', unverified: 'unverified', synthetic_demo: 'synthetic demo' }

/** Where an AI answer's evidence came from. Only records the server actually retrieved are listed. */
export function SourceList({ sources }: { sources: SourceRef[] }) {
  return (
    <details className="mt-1 px-1 text-[11px] text-ink-3">
      <summary className="inline-flex cursor-pointer items-center gap-1 hover:text-ink-2"><BookOpen size={11} />{sources.length} source{sources.length > 1 ? 's' : ''}</summary>
      <ul className="mt-1 space-y-0.5">
        {sources.map(s => (
          <li key={s.record_id}>
            <span className="text-ink-2">{s.record_id}</span> · {s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer" className="underline hover:text-teal">{s.source_name}</a> : s.source_name}
            {' '}· {STATUS[s.verification_status] ?? s.verification_status}{s.related_category ? ' · related category' : ''}
          </li>
        ))}
      </ul>
    </details>
  )
}
