import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Emblem, Wordmark } from '../components/common/Logo'
import { useAuth } from '../context/AuthContext'
import type { ApiError } from '../services/api'

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
  const input = 'w-full rounded-xl border border-line bg-[#0a1d33] px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-teal'
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10" style={{ background: 'var(--fs-stage)' }}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3"><Emblem height={72} /><Wordmark height={26} /><p className="text-sm text-ink-2">AI Repair Copilot</p></div>
        <div className="fs-border-grad rounded-[26px] p-[1.5px]">
          <form onSubmit={submit} className="space-y-3 rounded-[25px] bg-[#0a1d33]/95 p-6">
            <h1 className="text-xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
            {mode === 'register' && <>
              <label className="sr-only" htmlFor="name">Full name</label><input id="name" className={input} placeholder="Full name" autoComplete="name" required minLength={2} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
              <label className="sr-only" htmlFor="org">Organisation</label><input id="org" className={input} placeholder="Service company (optional)" value={f.org} onChange={e => setF({ ...f, org: e.target.value })} />
            </>}
            <label className="sr-only" htmlFor="email">Email</label><input id="email" type="email" className={input} placeholder="Email" autoComplete="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
            <label className="sr-only" htmlFor="pw">Password</label><input id="pw" type="password" className={input} placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
            {err && <p role="alert" className="rounded-xl border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{err}</p>}
            <button type="submit" disabled={busy} className="fs-amber-bg flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-bg disabled:opacity-70">{busy && <Loader2 size={16} className="animate-spin" />}{mode === 'login' ? 'Sign in' : 'Create account'}</button>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(null) }} className="w-full pt-1 text-center text-sm text-ink-2 hover:text-ink">
              {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
