/** Central HTTP client. Base URL from VITE_API_BASE_URL. No secrets ever live in the frontend. */
const RAW = import.meta.env.VITE_API_BASE_URL as string | undefined
// Unset: local dev default. Empty string: same origin (production single-service deploy).
const BASE = RAW === undefined ? 'http://localhost:8000' : RAW.replace(/\/$/, '')
const REFRESH_KEY = 'fixsaathi.refresh'

export class ApiError extends Error {
  status: number; code: string; details: Record<string, unknown>
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) { super(message); this.status = status; this.code = code; this.details = details }
}

let accessToken: string | null = null
let onSignedOut: (() => void) | null = null
let refreshing: Promise<boolean> | null = null

export const tokens = {
  set(access: string, refresh: string) { accessToken = access; try { localStorage.setItem(REFRESH_KEY, refresh) } catch { /* storage unavailable */ } },
  clear() { accessToken = null; try { localStorage.removeItem(REFRESH_KEY) } catch { /* ignore */ } },
  refresh(): string | null { try { return localStorage.getItem(REFRESH_KEY) } catch { return null } },
  access: () => accessToken,
  onSignedOut(fn: () => void) { onSignedOut = fn },
}

export const apiBase = BASE
export const wsUrl = (path: string) => (BASE || window.location.origin).replace(/^http/, 'ws') + path

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

function toError(status: number, body: unknown): ApiError {
  const e = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error
  if (e) return new ApiError(status, e.code || 'ERROR', e.message || 'Request failed', e.details || {})
  return new ApiError(status, status === 0 ? 'NETWORK' : 'ERROR', status === 0 ? 'Cannot reach the FixSaathi server.' : `Request failed (${status}).`)
}

export async function refreshTokens(): Promise<boolean> {
  const rt = tokens.refresh()
  if (!rt) return false
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) })
      if (!r.ok) { tokens.clear(); return false }
      const d = await r.json() as { access_token: string; refresh_token: string }
      tokens.set(d.access_token, d.refresh_token); return true
    } catch { return false } finally { setTimeout(() => { refreshing = null }, 0) }
  })()
  return refreshing
}

interface Opts { method?: string; body?: unknown; form?: FormData; timeoutMs?: number; signal?: AbortSignal; raw?: boolean }

export async function api<T>(path: string, o: Opts = {}, retried = false): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort('timeout'), o.timeoutMs ?? 30000)
  o.signal?.addEventListener('abort', () => ctl.abort('cancelled'))
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { method: o.method || (o.body !== undefined || o.form ? 'POST' : 'GET'), headers, body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined), signal: ctl.signal })
  } catch {
    clearTimeout(timer)
    if (ctl.signal.aborted && ctl.signal.reason === 'timeout') throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond.')
    if (ctl.signal.aborted) throw new ApiError(0, 'CANCELLED', 'Request cancelled.')
    throw toError(0, null)
  }
  clearTimeout(timer)
  if (res.status === 401 && !retried && !path.startsWith('/api/v1/auth/')) {
    if (await refreshTokens()) return api<T>(path, o, true)
    tokens.clear(); onSignedOut?.()
  }
  if (o.raw && res.ok) return res as unknown as T
  const body = await parse(res)
  if (!res.ok) throw toError(res.status, body)
  return body as T
}

/** Fetch a protected image and return an object URL for <img src>. */
export async function mediaUrl(path: string): Promise<string> {
  const r = await api<Response>(path, { raw: true })
  return URL.createObjectURL(await r.blob())
}
