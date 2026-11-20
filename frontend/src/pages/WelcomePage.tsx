import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Camera, Mic } from 'lucide-react'
import { Emblem } from '../components/common/Logo'
import { Composer } from '../components/composer/Composer'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { suggestions } from '../constants/prompts'

export default function WelcomePage() {
  const { send, newSession } = useApp()
  const { user } = useAuth()
  const first = user?.full_name.split(' ')[0] ?? ''
  const nav = useNavigate()
  const go = (text: string, a: Parameters<typeof send>[1] = []) => { newSession(); void send(text, a); nav('/assistant') }
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-8 md:px-8" style={{ background: 'var(--fs-glow)' }}>
      <div className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-7 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
          <Emblem height={96} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl"><span className="fs-grad-text">Hello, {first}.</span></h1>
          <p className="text-xl text-ink md:text-2xl">Your AI repair companion is ready.</p>
          <p className="mx-auto max-w-md text-[15px] text-ink-2">Describe the problem, show me the appliance, and let's solve it together.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="w-full">
          <Composer onSend={go} autoFocus />
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="flex flex-wrap justify-center gap-2">
          {suggestions.map(s => <button key={s.label} onClick={() => go(s.prompt)} className="rounded-full border border-white/30 px-4 py-2 text-sm text-ink transition-colors hover:border-teal hover:bg-teal/10">{s.label}</button>)}
        </motion.div>

        <div className="flex gap-3 md:hidden">
          <button onClick={() => nav('/voice')} className="fs-amber-bg flex h-14 items-center gap-2 rounded-full px-6 font-semibold text-bg shadow-[0_10px_30px_-10px_rgba(255,157,61,0.8)]"><Mic size={20} />Talk to FixSaathi</button>
        </div>
        <p className="hidden items-center gap-1.5 text-xs text-ink-3 md:flex"><Camera size={12} />Tip: use the camera button to show an appliance</p>
      </div>
      <p className="mt-6 pb-2 text-xs text-ink-3">Powered by intelligent multimodal AI</p>
    </div>
  )
}
