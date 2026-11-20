import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { PageHeader } from '../components/common/ui'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { newSession } = useApp()
  const nav = useNavigate()
  if (!user) return null
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
      <PageHeader title="Profile" />
      <div className="flex items-center gap-5 border-b border-line pb-6">
        <span className="fs-grad-bg flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-bg" aria-hidden>{user.full_name[0]}</span>
        <div><p className="text-xl font-semibold">{user.full_name}</p><p className="text-sm capitalize text-ink-2">{user.role}{user.organisation_name ? ` · ${user.organisation_name}` : ''}</p><p className="text-sm text-ink-2">{user.email}</p><p className="mt-1 text-sm text-ink-2">Preferred language: {user.preferred_language}</p></div>
      </div>
      <button onClick={async () => { await logout(); newSession(); nav('/login') }} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-surface"><LogOut size={16} />Sign out</button>
    </div>
  )
}
