// Pågående onlinespel på den här telefonen – så att man kan gå tillbaka om appen kraschat eller stängts.
export interface Session {
  code: string
  name: string
  host: boolean
  /** senaste aktivitet (Date.now()) */
  at: number
}

const KEY = 'ag-session'
/** äldre än så räknas spelet som avslutat */
export const SESSION_MAX_AGE = 4 * 60 * 60 * 1000
export const hostSnapshotKey = (code: string) => `ag-host-${code}`

function read(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
  } catch {
    return null
  }
}

export function loadSession(now = Date.now()): Session | null {
  const s = read()
  if (!s?.code || !s.name) return null
  if (now - s.at > SESSION_MAX_AGE) {
    clearSession()
    return null
  }
  return s
}

export function saveSession(s: Omit<Session, 'at'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, at: Date.now() }))
  } catch {
    /* ingen lagring */
  }
}

/** Håll sessionen färsk medan man spelar. */
export function touchSession() {
  const s = read()
  if (s) saveSession(s)
}

/** Lämnade spelet med flit – glöm det (och värdens sparade match). */
export function clearSession() {
  try {
    const s = read()
    if (s?.host) localStorage.removeItem(hostSnapshotKey(s.code))
    localStorage.removeItem(KEY)
  } catch {
    /* ingen lagring */
  }
}
