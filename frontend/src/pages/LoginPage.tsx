import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpenCheck, Camera, Loader2, ShieldCheck } from 'lucide-react'
import { Emblem, Wordmark } from '../components/common/Logo'
import { useAuth } from '../context/AuthContext'
import type { ApiError } from '../services/api'

const FEATURES = [
  { icon: BookOpenCheck, title: 'Grounded diagnosis', body: 'Ranked causes backed by sourced repair records, never invented error codes.' },
  { icon: ShieldCheck, title: 'Safety the AI cannot skip', body: 'Power steps stay locked on the server until you record power-off and tester checks.' },
  { icon: Camera, title: 'Photo, voice and Hinglish', body: 'Show the appliance, speak the symptom, get one clear step at a time.' },
]

export default function LoginPage() {
  const { login, register } = useAuth()
  const nav = useNavigate(); const loc = useLocation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [f, setF] = useState({ name: '', email: '', password: '', org: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      if (mode === 'login') await login(f.email, f.password)
      else await register(f.name, f.email, f.password, f.org)
      nav((loc.state as { from?: string } | null)?.from || '/', { replace: true })
    } catch (x) {
      const a = x as ApiError
      setErr(a.code === 'VALIDATION_ERROR' ? 'Please check the form. Passwords need at least 8 characters.' : a.message)
    } finally { setBusy(false) }
  }
  const label = 'mb-1.5 block text-xs font-medium text-ink-2'
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]" style={{ background: 'var(--fs-stage)' }}>
      <aside className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-teal/10 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3"><Emblem height={44} /><Wordmark height={20} /></div>
        <div className="relative max-w-lg">
          <p className="section-label mb-4 text-teal">AI repair copilot for field technicians</p>
          <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight xl:text-[44px]">A senior technician in <span className="fs-grad-text">every technician's pocket.</span></h2>
          <ul className="mt-10 space-y-5">
            {FEATURES.map(x => { const I = x.icon; return (
              <li key={x.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line-2 bg-surface-2/70"><I size={20} className="text-teal" /></span>
                <span><span className="block font-semibold">{x.title}</span><span className="mt-0.5 block text-sm leading-relaxed text-ink-2">{x.body}</span></span>
              </li>) })}
          </ul>
        </div>
        <p className="relative text-xs text-ink-3">Powered by Google Gemini · Team Tensor Trailblazers</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden"><Emblem height={64} /><Wordmark height={24} /><p className="text-sm text-ink-2">AI Repair Copilot</p></div>
          <div className="card card-pad !p-7">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
                <p className="mt-1 text-sm text-ink-2">{mode === 'login' ? 'Welcome back. Pick up where you left off.' : 'Free to try. Your sessions and reports stay in your account.'}</p>
              </div>
              {mode === 'register' && <>
                <div><label className={label} htmlFor="name">Full name</label><input id="name" className="field" placeholder="e.g. Ravi Kumar" autoComplete="name" required minLength={2} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
                <div><label className={label} htmlFor="org">Organisation <span className="text-ink-3">(optional)</span></label><input id="org" className="field" placeholder="Service company" value={f.org} onChange={e => setF({ ...f, org: e.target.value })} /></div>
              </>}
              <div><label className={label} htmlFor="email">Email</label><input id="email" type="email" className="field" placeholder="you@company.com" autoComplete="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
              <div><label className={label} htmlFor="pw">Password</label><input id="pw" type="password" className="field" placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></div>
              {err && <p role="alert" className="rounded-xl border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{err}</p>}
              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3 text-[15px]">{busy && <Loader2 size={16} className="animate-spin" />}{mode === 'login' ? 'Sign in' : 'Create account'}</button>
              <div className="flex items-center gap-3 text-[11px] text-ink-3"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
              <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(null) }} className="btn w-full">
                {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
              </button>
            </form>
          </div>
          <p className="mt-6 text-center text-xs text-ink-3">AI suggestions are estimates. Always verify isolation with your own tester.</p>
        </motion.div>
      </main>
    </div>
  )
}
