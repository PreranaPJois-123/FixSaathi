import { NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpenCheck, Bookmark, CircleHelp, FileText, History, LayoutDashboard, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Settings, UserRound, Users, Wrench, X } from 'lucide-react'
import { Emblem, Wordmark } from '../common/Logo'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { sessionService } from '../../services'

type Item = { to: string; label: string; icon: typeof Wrench; end?: boolean }
const groups: { title: string; items: Item[] }[] = [
  { title: 'Main', items: [
    { to: '/', label: 'New Session', icon: Plus, end: true },
    { to: '/assistant', label: 'AI Assistant', icon: MessageSquare },
    { to: '/history', label: 'Repair History', icon: History },
    { to: '/reports', label: 'Service Reports', icon: FileText },
  ] },
  { title: 'Workspace', items: [
    { to: '/repairs', label: 'My Repairs', icon: Wrench },
    { to: '/diagnoses', label: 'Saved Diagnoses', icon: Bookmark },
    { to: '/senior', label: 'Senior Technician Support', icon: Users },
    { to: '/manager', label: 'Manager Dashboard', icon: LayoutDashboard },
  ] },
  { title: 'Account', items: [
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/profile', label: 'Profile', icon: UserRound },
    { to: '/help', label: 'Help and Support', icon: CircleHelp },
  ] },
]

function NavItem({ item, collapsed, onNavigate }: { item: Item; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} title={collapsed ? item.label : undefined} aria-label={item.label}
      className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive ? 'border border-[#2d4d80] bg-surface text-ink' : 'border border-transparent text-ink-2 hover:bg-surface hover:text-ink'} ${collapsed ? 'justify-center' : ''}`}>
      {() => (<>
        <Icon size={18} className="shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {collapsed && <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink shadow-lg group-hover:block group-focus-visible:block">{item.label}</span>}
      </>)}
    </NavLink>
  )
}

function Panel({ collapsed, onNavigate, onClose }: { collapsed: boolean; onNavigate?: () => void; onClose?: () => void }) {
  const { newSession, toggleCollapsed, sessionsVersion } = useApp()
  const { user } = useAuth()
  const recent = useAsync(() => sessionService.list(5), [sessionsVersion])
  const isManager = user?.role === 'manager' || user?.role === 'admin'
  const nav = useNavigate()
  const go = () => { newSession(); nav('/'); onNavigate?.() }
  return (
    <div className="flex h-full flex-col bg-bg-2 px-3 py-4">
      <div className={`mb-4 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-1`}>
        {collapsed ? <Emblem height={34} /> : <div className="flex items-center gap-2.5"><Emblem height={34} /><div className="leading-tight"><Wordmark height={16} /><p className="mt-1 text-[11px] text-ink-2">AI Repair Copilot</p></div></div>}
        {onClose ? <button aria-label="Close menu" onClick={onClose} className="rounded-lg p-2 text-ink-2 hover:bg-surface"><X size={18} /></button> : null}
      </div>
      <button onClick={go} title="New session" aria-label="New session" className={`fs-grad-bg mb-4 flex items-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        <Plus size={18} />{!collapsed && 'New repair session'}
      </button>
      <nav className="flex-1 space-y-4 overflow-y-auto pr-1" aria-label="Primary">
        {groups.map(g => (
          <div key={g.title}>
            {!collapsed && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{g.title}</p>}
            <div className="space-y-0.5">{g.items.filter(i => i.to !== '/manager' || isManager).map(i => <NavItem key={i.to} item={i} collapsed={collapsed} onNavigate={onNavigate} />)}</div>
          </div>
        ))}
        {!collapsed && (
          <div>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Recent sessions</p>
            {recent.data && recent.data.items.length === 0 && <p className="px-3 py-2 text-xs text-ink-3">No sessions yet</p>}
            {(recent.data?.items ?? []).map(s => (
              <NavLink key={s.id} to={`/session/${s.id}`} onClick={onNavigate} className={({ isActive }) => `flex items-center gap-2 truncate rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface hover:text-ink'}`}>
                <BookOpenCheck size={15} className="shrink-0" /><span className="truncate">{s.title}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>
      <div className={`mt-3 flex items-center gap-3 border-t border-line pt-3 ${collapsed ? 'flex-col' : ''}`}>
        <NavLink to="/profile" onClick={onNavigate} aria-label="Open profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 hover:bg-surface">
          <span className="fs-grad-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-bg">{user?.full_name[0]}</span>
          {!collapsed && <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-medium">{user?.full_name}</span><span className="block truncate text-[11px] capitalize text-ink-2">{user?.role}</span></span>}
        </NavLink>
        <NavLink to="/settings" onClick={onNavigate} aria-label="Settings" title="Settings" className="rounded-lg p-2 text-ink-2 hover:bg-surface hover:text-ink"><Settings size={17} /></NavLink>
        {!onClose && <button onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="rounded-lg p-2 text-ink-2 hover:bg-surface hover:text-ink">{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>}
      </div>
    </div>
  )
}

export function DesktopSidebar() {
  const { collapsed } = useApp()
  return (
    <motion.aside animate={{ width: collapsed ? 76 : 280 }} transition={{ type: 'tween', duration: 0.22 }} className="hidden h-full shrink-0 border-r border-line md:block" aria-label="Sidebar">
      <Panel collapsed={collapsed} />
    </motion.aside>
  )
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60" />
          <motion.div initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'tween', duration: 0.22 }} className="absolute inset-y-0 left-0 w-[85%] max-w-[320px] border-r border-line">
            <Panel collapsed={false} onNavigate={onClose} onClose={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
