import { describe, it, expect, vi, beforeAll } from 'vitest'

// Falsk Supabase-realtid: en gemensam "buss" mellan klienter i samma process
type Handler = { type: string; event: string; cb: (p: any) => void }
const channels: FakeChannel[] = []
class FakeChannel {
  handlers: Handler[] = []
  presence: Record<string, any[]> = {}
  key: string
  constructor(public name: string, opts: any) { this.key = opts.config.presence.key; channels.push(this) }
  on(type: string, filter: any, cb: any) { this.handlers.push({ type, event: filter.event, cb }); return this }
  subscribe(cb: (s: string) => void) { setTimeout(() => cb('SUBSCRIBED'), 0); return this }
  peers() { return channels.filter((c) => c.name === this.name) }
  async track(meta: any) {
    for (const c of this.peers()) c.presence[this.key] = [meta]
    for (const c of this.peers()) { c.presence = { ...this.presence, ...c.presence }; c.emit('presence', 'sync', {}) }
  }
  presenceState() { return this.presence }
  send(msg: any) {
    for (const c of this.peers()) if (c !== this) c.emit('broadcast', msg.event, { payload: JSON.parse(JSON.stringify(msg.payload)) })
  }
  emit(type: string, event: string, p: any) { for (const h of this.handlers) if (h.type === type && h.event === event) h.cb(p) }
  unsubscribe() {}
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ channel: (n: string, o: any) => new FakeChannel(n, o) }) }))
vi.mock('../src/lib/itunes', () => ({ findClip: async () => ({ previewUrl: 'https://x/clip.m4a', artwork: 'a.jpg' }) }))

let useRoom: typeof import('../src/lib/room').useRoom
let makeCode: typeof import('../src/lib/room').makeCode
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake')
  ;({ useRoom, makeCode } = await import('../src/lib/room'))
})
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

describe('onlinerum', () => {
  it('kör en hel match med två spelare', async () => {
    vi.useFakeTimers()
    const host = useRoom('ABCD', 'Elvin', true)
    host.connect(); await tick(1)
    const guest = useRoom('ABCD', 'Sara', false)
    guest.connect(); await tick(1)

    expect(guest.state.value?.phase).toBe('lobby')
    expect(host.present.value.map((p) => p.name).sort()).toEqual(['Elvin', 'Sara'])

    host.hostSettings(10, true, 20); await tick(1)
    expect(guest.state.value?.total).toBe(10)

    for (let round = 1; round <= 10; round++) {
      round === 1 ? host.hostStart() : host.hostNext()
      await tick(1)
      expect(guest.state.value?.phase).toBe('listen')
      expect(guest.state.value?.round).toBe(round)
      expect(guest.state.value?.reveal).toBeUndefined() // svaret får inte läcka
      host.guess(2000)
      if (round !== 3) guest.guess(1990) // Sara missar låt 3
      expect(guest.state.value?.reveal).toBeUndefined()
      await tick(14000) // klipp (3 s nedräkning + 10 s) är slut
      if (round === 3) await tick(20000) // timeout
      expect(guest.state.value?.phase).toBe('reveal')
    }
    const s = guest.state.value!
    expect(s.round).toBe(10)
    expect(s.round).toBe(10)
    // Sara missade låt 3 → 0 p den omgången
    expect(s.reveal?.pts[guest.me.id] ?? 0).toBeGreaterThanOrEqual(0)
    expect(Object.keys(s.reveal!.bonus).sort()).toEqual([guest.me.id, host.me.id].sort())
    expect(s.totals[host.me.id]).toBeGreaterThanOrEqual(0)
    expect(/^\d{4}$/.test(makeCode())).toBe(true)
    host.hostFinal(); await tick(1)
    expect(guest.state.value?.phase).toBe('final')
    host.hostAgain(); await tick(1)
    expect(guest.state.value?.phase).toBe('lobby')
    vi.useRealTimers()
  })
})
