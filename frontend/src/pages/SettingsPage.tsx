import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '../components/common/ui'
import { useAuth } from '../context/AuthContext'
import type { Language } from '../types'

const langs: Language[] = ['English', 'Hindi', 'Kannada', 'Tamil']

export default function SettingsPage() {
  const { user, setLanguage } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const pick = async (l: Language) => { setBusy(true); setErr(null); try { await setLanguage(l) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
      <PageHeader title="Settings" />
      <section aria-labelledby="lang-h" className="border-b border-line pb-6">
        <h2 id="lang-h" className="mb-1 flex items-center gap-2 font-semibold">Preferred language{busy && <Loader2 size={14} className="animate-spin" />}</h2>
        <p className="mb-3 text-sm text-ink-2">Saved to your account. FixSaathi's AI replies and live voice use this language. The app's menus stay in English for now.</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Preferred language">
          {langs.map(l => <button key={l} role="radio" aria-checked={user?.preferred_language === l} disabled={busy} onClick={() => void pick(l)} className={`rounded-full border px-4 py-2 text-sm ${user?.preferred_language === l ? 'border-teal bg-teal/10 text-ink' : 'border-line text-ink-2 hover:bg-surface'}`}>{l}</button>)}
        </div>
        {err && <p role="alert" className="mt-2 text-sm text-crit">{err}</p>}
      </section>
      <section className="py-6 text-sm text-ink-2"><h2 className="mb-1 font-semibold text-ink">Theme</h2>Dark theme only.</section>
    </div>
  )
}
