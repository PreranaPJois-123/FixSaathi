import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { refreshTokens, tokens } from '../services/api'
import { authService } from '../services'
import type { Language, User } from '../types'

interface Ctx {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, org?: string) => Promise<void>
  logout: () => Promise<void>
  setLanguage: (l: Language) => Promise<void>
}
const AuthCtx = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    tokens.onSignedOut(() => setUser(null))
    ;(async () => {
      try { if (await refreshTokens()) setUser(await authService.currentUser()) } catch { tokens.clear() } finally { setLoading(false) }
    })()
  }, [])
  const login = useCallback(async (e: string, p: string) => { setUser(await authService.login(e, p)) }, [])
  const register = useCallback(async (n: string, e: string, p: string, o?: string) => { setUser(await authService.register(n, e, p, o)) }, [])
  const logout = useCallback(async () => { await authService.logout(); setUser(null) }, [])
  const setLanguage = useCallback(async (l: Language) => { setUser(await authService.updateMe({ preferred_language: l })) }, [])
  const value = useMemo(() => ({ user, loading, login, register, logout, setLanguage }), [user, loading, login, register, logout, setLanguage])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}
