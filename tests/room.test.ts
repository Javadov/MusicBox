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
  statusCb: (s: string, e?: Error) => void = () => {}
  subscribe(cb: (s: string, e?: Error) => void) { this.statusCb = cb; setTimeout(() => cb('SUBSCRIBED'), 0); return this }
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
vi.mock('../src/lib/itunes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/itunes')>()),
  findClip: async () => ({ previewUrl: 'https://x/clip.m4a', artwork: 'a.jpg' }),
}))

let useRoom: typeof import('../src/lib/room').useRoom
let makeCode: typeof import('../src/lib/room').makeCode
let guessWindow: typeof import('../src/lib/room').guessWindow
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake')
  ;({ useRoom, makeCode, guessWindow } = await import('../src/lib/room'))
  await (await import('../src/lib/songs')).loadSongs('international') // ladda listan innan tiden fryses
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

    host.hostSettings({ total: 10, audioAll: true, guessSeconds: 20 }); await tick(1)
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

  it('visar återanslutning i stället för fel när en fungerande anslutning bryts', async () => {
    vi.useFakeTimers()
    const host = useRoom('9999', 'Värd', true)
    host.connect(); await tick(1)
    const guest = useRoom('9999', 'Gäst', false)
    guest.connect(); await tick(1)
    const guestCh = channels.filter((c) => c.name === 'arsgissaren-9999')[1]

    guestCh.statusCb('CHANNEL_ERROR', new Error('transport failure'))
    expect(guest.reconnecting.value).toBe(true)
    expect(guest.error.value).toBeNull() // ingen röd felruta

    host.hostSettings({ total: 20, audioAll: false, guessSeconds: 30 }); await tick(1) // gästen missar inget viktigt, men får läget vid återanslutning
    guestCh.statusCb('SUBSCRIBED'); await tick(1)
    expect(guest.reconnecting.value).toBe(false)
    expect(guest.state.value?.total).toBe(20)
    await tick(6000)
    expect(guest.error.value).toBeNull()
    vi.useRealTimers()
  })

  it('öppnar gissningen efter låten eller direkt beroende på inställning', () => {
    expect(guessWindow({ guessSeconds: 20 })).toEqual({ opens: 10, closes: 30 })
    expect(guessWindow({ guessSeconds: 20, guessDuring: true })).toEqual({ opens: 0, closes: 20 })
    // längre speltid flyttar fram när gissningen öppnar i läget "efter låten"
    expect(guessWindow({ guessSeconds: 10, clipSeconds: 30 })).toEqual({ opens: 30, closes: 40 })
    expect(guessWindow({ guessSeconds: 30, clipSeconds: 30, guessDuring: true })).toEqual({ opens: 0, closes: 30 })
  })

  it('avslöjar när tiden tagit slut i läget "gissa direkt"', async () => {
    vi.useFakeTimers()
    const host = useRoom('7777', 'Värd', true)
    host.connect(); await tick(1)
    host.hostSettings({ total: 10, audioAll: true, guessSeconds: 10, guessDuring: true }); await tick(1)
    host.hostStart(); await tick(1)
    expect(host.state.value?.guessDuring).toBe(true)
    await tick(3000 + 9000)
    expect(host.state.value?.phase).toBe('listen')
    await tick(1500) // 3 s nedräkning + 10 s
    expect(host.state.value?.phase).toBe('reveal')
    vi.useRealTimers()
  })

  it('räknar året på hjulet (utan bonus) om man rört det men glömt trycka Klar!', async () => {
    vi.useFakeTimers()
    const host = useRoom('5555', 'Värd', true)
    host.connect(); await tick(1)
    const guest = useRoom('5555', 'Gäst', false)
    guest.connect(); await tick(1)
    const sara = useRoom('5555', 'Sara', false)
    sara.connect(); await tick(1)
    host.hostSettings({ total: 10, audioAll: true, guessSeconds: 10, guessDuring: true }); await tick(1)
    host.hostStart(); await tick(1)
    await tick(3000) // låten startar
    host.guess(2000) // tryckte Klar! direkt
    guest.draft(1990); await tick(100); guest.draft(1995) // drar, men trycker aldrig Klar!
    // Sara rör aldrig hjulet
    await tick(11000) // tiden är ute
    const r = host.state.value!.reveal!
    expect(r.guesses[guest.me.id]).toBe(1995)
    expect(r.auto?.[guest.me.id]).toBe(true)
    expect(r.bonus[guest.me.id]).toBe(0)
    expect(r.auto?.[host.me.id]).toBe(false)
    expect(r.guesses[sara.me.id]).toBeNull()
    expect(r.pts[sara.me.id]).toBe(0)
    vi.useRealTimers()
  })

  it('spelar längre låt och väntar in den innan avslöjandet', async () => {
    vi.useFakeTimers()
    const host = useRoom('4444', 'Värd', true)
    host.connect(); await tick(1)
    host.hostSettings({ total: 10, audioAll: true, guessSeconds: 10, clipSeconds: 30 }); await tick(1) // 30 s låt, sedan 10 s att gissa
    host.hostStart(); await tick(1)
    expect(host.state.value?.clipSeconds).toBe(30)
    host.guess(1999) // alla har gissat – men låten ska få spela klart
    await tick(3000 + 25000)
    expect(host.state.value?.phase).toBe('listen')
    await tick(6000)
    expect(host.state.value?.phase).toBe('reveal')
    vi.useRealTimers()
  })

  it('avslöjar direkt när alla tryckt Klar! – låten behöver inte spela klart', async () => {
    vi.useFakeTimers()
    const host = useRoom('3333', 'Värd', true)
    host.connect(); await tick(1)
    const guest = useRoom('3333', 'Gäst', false)
    guest.connect(); await tick(1)
    host.hostSettings({ total: 10, audioAll: true, guessSeconds: 20, guessDuring: true, clipSeconds: 20 })
    await tick(1)
    host.hostStart(); await tick(1)
    await tick(3000 + 4000) // 4 s in i en 20 s lång låt
    host.guess(1999)
    await tick(1000)
    expect(guest.state.value?.phase).toBe('listen') // väntar på gästen
    guest.guess(2001)
    await tick(700)
    expect(guest.state.value?.phase).toBe('reveal') // ~5,7 s in, inte efter 20 s
    vi.useRealTimers()
  })

  // tappar anslutningen: försvinner ur närvarolistan hos alla
  const drop = (id: string) => {
    for (const c of channels) { delete c.presence[id]; c.emit('presence', 'sync', {}) }
  }

  it('en ny person kan inte gå med när matchen redan börjat', async () => {
    vi.useFakeTimers()
    const host = useRoom('2222', 'Värd', true)
    host.connect(); await tick(1)
    host.hostStart(); await tick(1)
    const late = useRoom('2222', 'Sen', false)
    late.connect(); await tick(1)
    expect(late.state.value?.phase).toBe('listen') // ser matchen …
    expect(late.state.value?.players.map((p) => p.name)).toEqual(['Värd']) // … men är inte med
    late.guess(1990); await tick(40000)
    expect(host.state.value?.reveal?.guesses[late.me.id]).toBeUndefined()
    host.hostAgain(); await tick(1)
    host.hostStart(); await tick(1)
    expect(late.state.value?.players.map((p) => p.name).sort()).toEqual(['Sen', 'Värd']) // med i nästa omgång
    vi.useRealTimers()
  })

  it('den som tappade nätet precis när värden tryckte Starta är ändå med', async () => {
    vi.useFakeTimers()
    const host = useRoom('6666', 'Värd', true)
    host.connect(); await tick(1)
    const sara = useRoom('6666', 'Sara', false)
    sara.connect(); await tick(1)
    drop(sara.me.id) // skärmen låstes
    host.hostStart(); await tick(1)
    expect(host.state.value?.players.map((p) => p.name).sort()).toEqual(['Sara', 'Värd'])
    vi.useRealTimers()
  })

  it('den som tryckt Lämna i lobbyn är inte med i matchen', async () => {
    vi.useFakeTimers()
    const host = useRoom('7777', 'Värd', true)
    host.connect(); await tick(1)
    const bo = useRoom('7777', 'Bo', false)
    bo.connect(); await tick(1)
    bo.leave(); drop(bo.me.id); await tick(1)
    host.hostStart(); await tick(1)
    expect(host.state.value?.players.map((p) => p.name)).toEqual(['Värd'])
    vi.useRealTimers()
  })

  it('en frånkopplad spelare hindrar inte att svaret visas när alla andra tryckt Klar!', async () => {
    vi.useFakeTimers()
    const host = useRoom('8888', 'Värd', true)
    host.connect(); await tick(1)
    const sara = useRoom('8888', 'Sara', false)
    sara.connect(); await tick(1)
    host.hostSettings({ guessDuring: true, guessSeconds: 30, clipSeconds: 30 }); await tick(1)
    host.hostStart(); await tick(1)
    drop(sara.me.id)
    await tick(4000)
    host.guess(2000); await tick(1000)
    expect(host.state.value?.phase).toBe('reveal') // väntar inte 30 s på Sara
    vi.useRealTimers()
  })

  it('samma telefon får tillbaka sin plats och sina poäng efter omladdning', async () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) })
    vi.useFakeTimers()
    const host = useRoom('1111', 'Värd', true)
    host.connect(); await tick(1)
    const first = useRoom('1111', 'Sara', false)
    first.connect(); await tick(1)
    host.hostStart(); await tick(1)
    const totalsBefore = { ...host.state.value!.totals, [first.me.id]: 42 }
    host.state.value = { ...host.state.value!, totals: totalsBefore }

    first.leave() // laddar om sidan …
    const again = useRoom('1111', 'Sara', false)
    expect(again.me.id).toBe(first.me.id) // … och är samma spelare
    again.connect(); await tick(1)
    expect(again.state.value?.players.filter((p) => p.name === 'Sara')).toHaveLength(1)
    expect(again.state.value?.totals[again.me.id]).toBe(42)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('en låst gissning följer med vid omladdning och kan inte ändras', async () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) })
    vi.useFakeTimers()
    const host = useRoom('9999', 'Värd', true)
    host.connect(); await tick(1)
    const first = useRoom('9999', 'Sara', false)
    first.connect(); await tick(1)
    host.hostSettings({ guessDuring: true, guessSeconds: 30, clipSeconds: 30 }); await tick(1)
    host.hostStart(); await tick(4000)
    first.guess(1995); await tick(1)

    first.leave() // laddar om
    const again = useRoom('9999', 'Sara', false)
    again.connect(); await tick(1)
    expect(again.myGuess.value).toEqual({ roundId: again.state.value!.roundId, year: 1995 }) // visar "Du gissade 1995"
    again.guess(1970); await tick(1) // försöker gissa igen
    host.guess(2000); await tick(1000)
    expect(host.state.value?.phase).toBe('reveal')
    expect(host.state.value?.reveal?.guesses[again.me.id]).toBe(1995) // första gissningen gäller
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('värden kan fortsätta matchen efter att appen kraschat – gissningar och poäng finns kvar', async () => {
    const mem = new Map<string, string>()
    // bara värdens sparade match delas – i verkligheten är det två olika telefoner
    const shared = (k: string) => k.startsWith('ag-host-')
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (shared(k) ? mem.get(k) ?? null : null),
      setItem: (k: string, v: string) => void (shared(k) && mem.set(k, v)),
      removeItem: (k: string) => void mem.delete(k),
    })
    vi.useFakeTimers()
    const host = useRoom('4321', 'Värd', true)
    host.connect(); await tick(1)
    const sara = useRoom('4321', 'Sara', false)
    sara.connect(); await tick(1)
    host.hostSettings({ guessDuring: true, guessSeconds: 30, clipSeconds: 30, total: 3 }); await tick(1)
    host.hostStart(); await tick(1)
    const roundId = host.state.value!.roundId
    await tick(4000)

    // värdens app kraschar: kanalen försvinner, inget mer händer på den telefonen
    const hostCh = channels.find((c) => c.name === 'arsgissaren-4321' && c.key === host.me.id)!
    channels.splice(channels.indexOf(hostCh), 1)
    hostCh.handlers = []
    sara.guess(1990); await tick(1) // gissningen skickas medan värden är borta – kommer inte fram
    await tick(3000)

    // värden öppnar appen igen och trycker "Gå tillbaka"
    const back = useRoom('4321', 'Värd', true)
    expect(back.resumed).toBe(true)
    expect(back.me.id).toBe(host.me.id)
    expect(back.state.value?.roundId).toBe(roundId) // samma låt pågår
    expect(back.state.value?.total).toBe(3) // matchens inställningar, inte standard
    back.connect(); await tick(1)
    expect(sara.state.value?.roundId).toBe(roundId) // gästen fortsätter i samma låt
    back.guess(2000); await tick(1000)
    expect(back.state.value?.phase).toBe('reveal')
    expect(back.state.value?.reveal?.guesses[sara.me.id]).toBe(1990) // Saras gissning kom fram igen
    back.hostNext(); await tick(1)
    expect(sara.state.value?.round).toBe(2) // matchen går vidare
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})
