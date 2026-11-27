import { ref, shallowRef } from 'vue'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { drawSongs, points, speedBonus, speedFactor } from './game'
import { correctedYear, findClip } from './itunes'
import { CLIP_SECONDS } from './audio'
import type { MessageKey } from '../i18n'
import { hostSnapshotKey } from './session'
import { DEFAULT_LIST, getList, loadSongs, type ListId, type Song } from './songs'

// ---------- Supabase ----------
const env = import.meta.env
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const key =
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } }) : null

// ---------- Typer ----------
export type Phase = 'lobby' | 'loading' | 'listen' | 'reveal' | 'final'
export interface Player {
  id: string
  name: string
}
export interface RoomState {
  phase: Phase
  round: number
  total: number
  roundId: string
  audioAll: boolean
  guessSeconds: number
  /** true = gissa medan låten spelar (tiden räknas från låtstart), false = gissa efter låten */
  guessDuring?: boolean
  /** hur länge låten spelar, i sekunder (10/20/30) */
  clipSeconds?: number
  /** vilken låtlista som spelas */
  list?: ListId
  /** ms tills klippet startar, räknat från när meddelandet skickades */
  startIn?: number
  clipUrl?: string
  reveal?: {
    a: string
    t: string
    y: number
    artwork?: string
    guesses: Record<string, number | null>
    /** totala poäng för omgången (inkl. bonus) */
    pts: Record<string, number>
    /** varav snabbhetsbonus */
    bonus: Record<string, number>
    /** true = spelaren rörde hjulet men tryckte aldrig Klar!, året på hjulet räknades (utan bonus) */
    auto?: Record<string, boolean>
  }
  totals: Record<string, number>
  players: Player[]
}

/** Fel som visas för spelaren – översätts i vyn med t(key, params). */
export interface AppError {
  key: MessageKey
  params?: Record<string, string | number>
}

/** Det värden kan ställa in i lobbyn. */
export type RoomSettings = Pick<RoomState, 'total' | 'audioAll' | 'guessSeconds' | 'guessDuring' | 'clipSeconds' | 'list'>

/** Allt värden behöver för att fortsätta en match efter att appen kraschat eller stängts. */
interface HostSnapshot {
  state: RoomState
  songs: Song[]
  songIdx: number
  current: (Song & { artwork?: string }) | null
  hostStartAt: number
  guesses: Record<string, number | null>
  guessTimes: Record<string, number>
  drafts: Record<string, number>
  members: [string, string][]
  /** värdens eget spelar-id i matchen */
  hostId: string
}

export const CODE_LENGTH = 4
export const makeCode = () =>
  Array.from({ length: CODE_LENGTH }, () => Math.floor(Math.random() * 10)).join('')
const uid = () => Math.random().toString(36).slice(2, 10)

/**
 * Samma telefon får samma spelar-id i ett rum, även efter omladdning eller om man går med igen.
 * Då känner värden igen spelaren och den får tillbaka sin plats och sina poäng.
 */
const PLAYER_KEY = 'ag-player'
/** spelarens låsta gissning i pågående låt – så den följer med vid omladdning */
const GUESS_KEY = 'ag-guess'
const storage = {
  get<T>(k: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null
    } catch {
      return null
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* ingen lagring */
    }
  },
}
function playerId(code: string): string {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? 'null') as { code?: string; id?: string } | null
    if (saved?.code === code && saved.id) return saved.id
    const id = uid()
    localStorage.setItem(PLAYER_KEY, JSON.stringify({ code, id }))
    return id
  } catch {
    return uid() // ingen lagring (privat läge, tester)
  }
}
const START_DELAY = 3000
/** paus mellan att alla tryckt Klar! och avslöjandet */
const ALL_IN_PAUSE = 600

/** Låtens speltid i sekunder (äldre rum utan inställningen spelar 10 s). */
export const clipLength = (s: { clipSeconds?: number }) => s.clipSeconds ?? CLIP_SECONDS

/** När gissningen öppnar och stänger, i sekunder från att klippet startar. */
export function guessWindow(s: { guessSeconds: number; guessDuring?: boolean; clipSeconds?: number }) {
  const opens = s.guessDuring ? 0 : clipLength(s)
  return { opens, closes: opens + s.guessSeconds }
}

export function useRoom(code: string, name: string, isHost: boolean) {
  // Värden fortsätter en sparad match? Då är värden samma spelare som förut.
  const snap = isHost ? storage.get<HostSnapshot>(hostSnapshotKey(code)) : null
  const me: Player = { id: snap?.hostId ?? playerId(code), name }
  const state = ref<RoomState | null>(null)
  const present = ref<(Player & { host: boolean })[]>([])
  const connected = ref(false)
  /** true när en tidigare fungerande anslutning tillfälligt har brutits (t.ex. appen låg i bakgrunden) */
  const reconnecting = ref(false)
  const error = ref<AppError | null>(null)
  /** lokal Date.now()-tid då klippet startar */
  const startAt = ref(0)
  const myGuess = ref<{ roundId: string; year: number } | null>(null)
  const channel = shallowRef<RealtimeChannel | null>(null)

  // värdens interna data
  /** alla som varit i lobbyn inför den här matchen (id → namn) */
  const members = new Map<string, string>()
  let songs: Song[] = []
  let songIdx = 0
  let current: (Song & { artwork?: string }) | null = null
  let hostStartAt = 0
  let guesses: Record<string, number | null> = {}
  /** ms från klippstart till att gissningen kom fram till värden */
  let guessTimes: Record<string, number> = {}
  /** året som står på hjulet hos spelare som rört det men inte tryckt Klar! */
  let drafts: Record<string, number> = {}
  let draftTimer: ReturnType<typeof setTimeout> | undefined
  let revealTimer: ReturnType<typeof setTimeout> | undefined

  const onState = ref<((s: RoomState) => void) | null>(null)
  /** senaste året på hjulet (för att skicka om om värden startar om) */
  let lastDraft: { roundId: string; year: number } | null = null

  // ---------- Värden fortsätter en sparad match ----------
  if (snap?.state) {
    songs = snap.songs
    songIdx = snap.songIdx
    current = snap.current
    hostStartAt = snap.hostStartAt
    guesses = snap.guesses
    guessTimes = snap.guessTimes
    drafts = snap.drafts
    for (const [id, n] of snap.members) members.set(id, n)
    state.value = snap.state
    startAt.value = hostStartAt
    const g = storage.get<{ code: string; roundId: string; year: number }>(GUESS_KEY)
    if (g?.code === code && g.roundId === snap.state.roundId) myGuess.value = { roundId: g.roundId, year: g.year }
  }
  /** true om värden fortsätter en sparad match i stället för att börja om */
  const resumed = !!snap?.state

  function persist() {
    if (!isHost || !state.value) return
    const data: HostSnapshot = {
      state: state.value, songs, songIdx, current, hostStartAt, guesses, guessTimes, drafts, members: [...members],
      hostId: me.id,
    }
    storage.set(hostSnapshotKey(code), data)
  }

  /** Körs när värden är ansluten igen efter en omstart av appen. */
  function resume() {
    const s = state.value
    if (!s) return hostLobby()
    onState.value?.(s) // starta värdens eget ljud/visning
    if (s.phase === 'loading') {
      if (!songs.length) return hostAgain() // kraschade innan låtlistan hunnit laddas
      return hostNext()
    }
    sendSnapshot()
    // gissningar som skickades medan värden var borta kom aldrig fram – be om dem igen
    channel.value?.send({ type: 'broadcast', event: 'resync', payload: { roundId: s.roundId } })
    if (s.phase === 'listen') {
      const closesAt = hostStartAt + guessWindow(s).closes * 1000
      clearTimeout(revealTimer)
      revealTimer = setTimeout(hostReveal, Math.max(0, closesAt - Date.now()))
    }
  }

  function apply(s: RoomState) {
    const newRound = s.phase === 'listen' && s.roundId !== state.value?.roundId
    state.value = s
    if (newRound) {
      startAt.value = Date.now() + (s.startIn ?? 0)
      // redan gissat i den här låten (före en omladdning)? Då gäller den gissningen.
      const saved = storage.get<{ code: string; roundId: string; year: number }>(GUESS_KEY)
      if (saved?.code === code && saved.roundId === s.roundId) myGuess.value = { roundId: saved.roundId, year: saved.year }
    }
    onState.value?.(s)
  }

  function send(s: RoomState) {
    apply(s)
    persist()
    channel.value?.send({ type: 'broadcast', event: 'state', payload: s })
  }

  function connect() {
    if (!supabase) {
      error.value = { key: 'err.noSupabase' }
      return
    }
    const ch = supabase.channel(`arsgissaren-${code}`, {
      config: { broadcast: { self: false }, presence: { key: me.id } },
    })
    ch.on('presence', { event: 'sync' }, () => {
      const ps = ch.presenceState<{ name: string; host: boolean }>()
      present.value = Object.entries(ps).map(([id, metas]) => ({
        id,
        name: metas[0]?.name ?? '?',
        host: !!metas[0]?.host,
      }))
      if (isHost && state.value?.phase === 'lobby') {
        for (const p of present.value) members.set(p.id, p.name)
        hostLobby()
      }
    })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (!isHost) apply(payload as RoomState)
    })
    ch.on('broadcast', { event: 'hello' }, () => {
      if (isHost) sendSnapshot()
    })
    ch.on('broadcast', { event: 'guess' }, ({ payload }) => {
      if (isHost) hostGuess(payload.id, payload.roundId, payload.year)
    })
    ch.on('broadcast', { event: 'bye' }, ({ payload }) => {
      // tryckte Lämna i lobbyn – ska inte räknas med när matchen startar
      if (isHost && state.value?.phase === 'lobby') members.delete(payload.id)
    })
    ch.on('broadcast', { event: 'resync' }, ({ payload }) => {
      // värden har startat om – skicka vår gissning (eller året på hjulet) igen
      if (isHost) return
      if (myGuess.value?.roundId === payload.roundId)
        ch.send({ type: 'broadcast', event: 'guess', payload: { id: me.id, ...myGuess.value } })
      else if (lastDraft?.roundId === payload.roundId)
        ch.send({ type: 'broadcast', event: 'draft', payload: { id: me.id, ...lastDraft } })
    })
    ch.on('broadcast', { event: 'draft' }, ({ payload }) => {
      if (isHost) hostDraft(payload.id, payload.roundId, payload.year)
    })
    const connectTimer = setTimeout(() => {
      if (!connected.value && !error.value)
        error.value = { key: 'err.noContact' }
    }, 10000)
    ch.subscribe(async (status, err) => {
      if (err) console.error('[realtime]', status, err)
      if (status === 'SUBSCRIBED') {
        clearTimeout(connectTimer)
        const wasReconnect = connected.value
        connected.value = true
        reconnecting.value = false
        error.value = null
        await ch.track({ name: me.name, host: isHost })
        if (isHost && resumed && !wasReconnect) {
          resume()
        } else if (isHost) {
          hostLobby()
          if (wasReconnect) sendSnapshot() // gäster kan ha missat något medan värden var borta
        } else if (wasReconnect) {
          ch.send({ type: 'broadcast', event: 'hello', payload: {} }) // be värden om senaste läget
        } else {
          ch.send({ type: 'broadcast', event: 'hello', payload: {} })
          setTimeout(() => {
            if (!state.value) error.value = { key: 'err.noRoom', params: { code } }
          }, 5000)
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!channel.value) return // vi lämnade rummet själva
        if (connected.value) {
          // Har fungerat tidigare – Supabase återansluter av sig själv, visa bara en diskret notis
          reconnecting.value = true
        } else {
          clearTimeout(connectTimer)
          error.value = { key: 'err.connect', params: { status: status + (err?.message ? ': ' + err.message : '') } }
        }
      }
    })
    channel.value = ch
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
  }

  /** iOS fryser webbsockets i bakgrunden – väck anslutningen direkt när appen visas igen. */
  function onVisible() {
    if (document.visibilityState !== 'visible' || !supabase || !channel.value) return
    if (!supabase.realtime.isConnected()) {
      reconnecting.value = true
      supabase.realtime.connect()
    }
  }

  function sendSnapshot() {
    if (!state.value) return
    const s = { ...state.value }
    if (s.phase === 'listen') s.startIn = hostStartAt - Date.now()
    channel.value?.send({ type: 'broadcast', event: 'state', payload: s })
  }

  function leave() {
    channel.value?.send({ type: 'broadcast', event: 'bye', payload: { id: me.id } })
    clearTimeout(draftTimer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    clearTimeout(revealTimer)
    channel.value?.unsubscribe()
    channel.value = null
  }

  // ---------- Spelare ----------
  function guess(year: number) {
    const s = state.value
    if (!s || s.phase !== 'listen' || myGuess.value?.roundId === s.roundId) return
    myGuess.value = { roundId: s.roundId, year }
    storage.set(GUESS_KEY, { code, ...myGuess.value })
    clearTimeout(draftTimer)
    if (isHost) hostGuess(me.id, s.roundId, year)
    else channel.value?.send({ type: 'broadcast', event: 'guess', payload: { id: me.id, roundId: s.roundId, year } })
  }

  /** Året som står på hjulet just nu (spelaren har rört det men inte tryckt Klar!). */
  function draft(year: number) {
    const s = state.value
    if (!s || s.phase !== 'listen' || myGuess.value?.roundId === s.roundId) return
    if (isHost) return hostDraft(me.id, s.roundId, year)
    // samla ihop snabba ändringar medan man drar
    clearTimeout(draftTimer)
    const roundId = s.roundId
    lastDraft = { roundId, year }
    draftTimer = setTimeout(
      () => channel.value?.send({ type: 'broadcast', event: 'draft', payload: { id: me.id, roundId, year } }),
      250,
    )
  }

  // ---------- Värd ----------
  function base(): RoomState {
    return (
      state.value ?? {
        phase: 'lobby',
        round: 0,
        total: 10,
        roundId: '',
        audioAll: true,
        guessSeconds: 20,
        guessDuring: false,
        clipSeconds: CLIP_SECONDS,
        list: DEFAULT_LIST,
        totals: {},
        players: [],
      }
    )
  }

  function hostLobby() {
    const s = base()
    if (s.phase !== 'lobby') return
    send({ ...s, players: present.value.map(({ id, name }) => ({ id, name })) })
  }

  function hostSettings(settings: Partial<RoomSettings>) {
    if (base().phase !== 'lobby') return // inställningar ändras bara i lobbyn
    send({ ...base(), ...settings })
  }

  async function hostStart() {
    const s = base()
    // Alla som varit i lobbyn är med – även den som tappade anslutningen precis nu.
    // Efter start kommer bara de här spelarna in igen (nya får vänta till nästa omgång).
    for (const p of present.value) members.set(p.id, p.name)
    const players = [...members].map(([id, name]) => ({ id, name }))
    // visa "laddar" direkt medan låtlistan hämtas
    send({ ...s, phase: 'loading', players, totals: Object.fromEntries(players.map((p) => [p.id, 0])), round: 0 })
    try {
      songs = drawSongs(await loadSongs(s.list ?? DEFAULT_LIST), s.total)
    } catch {
      error.value = { key: 'err.list' }
      return hostFinal()
    }
    songIdx = 0
    hostNext()
  }

  async function hostNext() {
    const s = base()
    if (s.round >= s.total) return hostFinal()
    clearTimeout(revealTimer)
    send({ ...s, phase: 'loading', reveal: undefined })
    const countries = getList(s.list).countries
    let clip = null
    while (!clip && songIdx < songs.length) {
      current = songs[songIdx++]
      clip = await findClip(current, countries)
      if (clip) current = { ...current, y: correctedYear(current, clip), artwork: clip.artwork }
    }
    if (!clip || !current) {
      error.value = { key: 'err.clips' }
      return hostFinal()
    }
    // förladda nästa i bakgrunden
    if (songs[songIdx]) findClip(songs[songIdx], countries)
    guesses = {}
    guessTimes = {}
    drafts = {}
    hostStartAt = Date.now() + START_DELAY
    const ns: RoomState = {
      ...base(),
      phase: 'listen',
      round: s.round + 1,
      roundId: uid(),
      clipUrl: clip.previewUrl,
      startIn: START_DELAY,
      reveal: undefined,
    }
    send(ns)
    revealTimer = setTimeout(hostReveal, START_DELAY + guessWindow(ns).closes * 1000)
  }

  function hostGuess(id: string, roundId: string, year: number) {
    const s = state.value
    if (!s || s.phase !== 'listen' || s.roundId !== roundId || id in guesses) return
    guesses[id] = year
    // tid räknas från att gissningen öppnade (låtstart eller låtslut beroende på inställning)
    guessTimes[id] = Math.max(0, Date.now() - hostStartAt - guessWindow(s).opens * 1000)
    persist()
    // Bara anslutna spelare räknas – den som tappat nätet ska inte hålla upp de andra
    const online = new Set(present.value.map((p) => p.id))
    const allIn = s.players.filter((p) => online.has(p.id) || p.id === me.id).every((p) => p.id in guesses)
    if (allIn) {
      clearTimeout(revealTimer)
      // Alla har tryckt Klar! – avslöja direkt (låten stoppas), ingen anledning att lyssna klart.
      // Aldrig innan gissningen öppnat, och en kort paus så att den sista ser att det låstes.
      const opensAt = hostStartAt + guessWindow(s).opens * 1000
      const wait = Math.max(0, opensAt - Date.now()) + ALL_IN_PAUSE
      revealTimer = setTimeout(hostReveal, wait)
    }
  }

  function hostDraft(id: string, roundId: string, year: number) {
    const s = state.value
    if (!s || s.phase !== 'listen' || s.roundId !== roundId || id in guesses) return
    drafts[id] = year
    persist()
  }

  function hostReveal() {
    const s = base()
    if (s.phase !== 'listen' || !current) return
    const g: Record<string, number | null> = {}
    const pts: Record<string, number> = {}
    const bonus: Record<string, number> = {}
    const auto: Record<string, boolean> = {}
    const totals = { ...s.totals }
    const windowMs = s.guessSeconds * 1000
    for (const p of s.players) {
      // Tryckte inte Klar! men rörde hjulet → året på hjulet räknas, utan snabbhetsbonus
      auto[p.id] = !(p.id in guesses) && p.id in drafts
      g[p.id] = guesses[p.id] ?? drafts[p.id] ?? null
      const speed = p.id in guessTimes ? speedFactor(guessTimes[p.id], windowMs) : null
      pts[p.id] = points(g[p.id], current.y, speed)
      bonus[p.id] = speedBonus(g[p.id], current.y, speed)
      totals[p.id] = (totals[p.id] ?? 0) + pts[p.id]
    }
    send({
      ...s,
      phase: 'reveal',
      totals,
      reveal: { a: current.a, t: current.t, y: current.y, artwork: current.artwork, guesses: g, pts, bonus, auto },
    })
  }

  function hostFinal() {
    clearTimeout(revealTimer)
    send({ ...base(), phase: 'final' })
  }

  function hostAgain() {
    clearTimeout(revealTimer)
    // ny omgång: de som är i rummet nu (även de som väntat under förra matchen)
    members.clear()
    for (const p of present.value) members.set(p.id, p.name)
    send({ ...base(), phase: 'lobby', round: 0, totals: {}, reveal: undefined })
    hostLobby()
  }

  return {
    me,
    state,
    present,
    connected,
    reconnecting,
    resumed,
    error,
    startAt,
    myGuess,
    onState,
    connect,
    leave,
    guess,
    draft,
    hostSettings,
    hostStart,
    hostNext,
    hostReveal,
    hostFinal,
    hostAgain,
  }
}
