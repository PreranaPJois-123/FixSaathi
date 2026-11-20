import { Loader2, ShieldAlert } from 'lucide-react'
import type { SafetyState } from '../../types'

interface Props { state: SafetyState | null; busy: boolean; canEdit: boolean; onChange: (power: boolean, tester: boolean) => void }

export function SafetyPanel({ state, busy, canEdit, onChange }: Props) {
  const power = state?.power_off_confirmed ?? false
  const tester = state?.tester_checked ?? false
  const both = !!state?.unlocked
  const box = 'mt-0.5 h-5 w-5 shrink-0 accent-[#2fc4b0]'
  return (
    <section aria-labelledby="safety-h" className={`rounded-3xl border p-5 ${both ? 'border-ok/30 bg-ok/5' : 'border-crit/30 bg-crit/5'}`}>
      <h2 id="safety-h" className="flex items-center gap-2 font-semibold"><ShieldAlert size={18} className={both ? 'text-ok' : 'text-crit'} />Safety before opening anything{busy && <Loader2 size={14} className="animate-spin text-ink-3" />}</h2>
      <p className="mt-2 text-sm text-ink-2">These are <strong className="text-ink">your own statements</strong>, recorded on the server for this session only. FixSaathi cannot measure voltage, control a tester or confirm that a circuit is dead. Always verify with your own tester.</p>
      <div className="mt-4 space-y-3">
        <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" disabled={busy || !canEdit} className={box} checked={power} onChange={e => onChange(e.target.checked, tester)} /><span>I state that I have switched the power off at the MCB or isolator.</span></label>
        <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" disabled={busy || !canEdit} className={box} checked={tester} onChange={e => onChange(power, e.target.checked)} /><span>I state that I checked with my own tester and found no live line.</span></label>
      </div>
      <p className={`mt-4 text-xs font-medium ${both ? 'text-ok' : 'text-crit'}`} role="status">
        {state?.expired ? 'Your earlier statements expired. Check again and record them again.'
          : both ? `Statements recorded. Power-sensitive steps are unlocked until ${state?.expires_at ? new Date(state.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'they expire'}.`
            : 'Power-sensitive steps stay locked on the server until both statements are recorded.'}
      </p>
      {!canEdit && <p className="mt-2 text-xs text-ink-3">Only the technician working on this session can record these.</p>}
    </section>
  )
}
