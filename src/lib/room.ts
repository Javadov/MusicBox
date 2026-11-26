import { ref, shallowRef } from 'vue'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { drawSongs, points, speedBonus, speedFactor } from './game'
import { findClip } from './itunes'
import { CLIP_SECONDS } from './audio'
import type { Song } from './songs'

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
  }
  totals: Record<string, number>
  players: Player[]
}

export const CODE_LENGTH = 4
export const makeCode = () =>
  Array.from({ length: CODE_LENGTH }, () => Math.floor(Math.random() * 10)).join('')
const uid = () => Math.random().toString(36).slice(2, 10)
const START_DELAY = 3000

export function useRoom(code: string, name: string, isHost: boolean) {
  const me: Player = { id: uid(), name }
  const state = ref<RoomState | null>(null)
  const present = ref<(Player & { host: boolean })[]>([])
  const connected = ref(false)
  const error = ref('')
  /** lokal Date.now()-tid då klippet startar */
  const startAt = ref(0)
  const myGuess = ref<{ roundId: string; year: number } | null>(null)
  const channel = shallowRef<RealtimeChannel | null>(null)

  // värdens interna data
  let songs: Song[] = []
  let songIdx = 0
  let current: (Song & { artwork?: string }) | null = null
  let hostStartAt = 0
  let guesses: Record<string, number | null> = {}
  /** ms från klippstart till att gissningen kom fram till värden */
  let guessTimes: Record<string, number> = {}
  let revealTimer: ReturnType<typeof setTimeout> | undefined

  const onState = ref<((s: RoomState) => void) | null>(null)

  function apply(s: RoomState) {
    const newRound = s.phase === 'listen' && s.roundId !== state.value?.roundId
    state.value = s
    if (newRound) startAt.value = Date.now() + (s.startIn ?? 0)
    onState.value?.(s)
  }

  function send(s: RoomState) {
    apply(s)
    channel.value?.send({ type: 'broadcast', event: 'state', payload: s })
  }

  function connect() {
    if (!supabase) {
      error.value = 'Supabase är inte konfigurerat (.env saknas).'
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
      if (isHost && state.value?.phase === 'lobby') hostLobby()
    })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (!isHost) apply(payload as RoomState)
    })
    ch.on('broadcast', { event: 'hello' }, () => {
      if (isHost && state.value) {
        const s = { ...state.value }
        if (s.phase === 'listen') s.startIn = hostStartAt - Date.now()
        channel.value?.send({ type: 'broadcast', event: 'state', payload: s })
      }
    })
    ch.on('broadcast', { event: 'guess' }, ({ payload }) => {
      if (isHost) hostGuess(payload.id, payload.roundId, payload.year)
    })
    const connectTimer = setTimeout(() => {
      if (!connected.value && !error.value)
        error.value = 'Får ingen kontakt med servern. Kolla nätverket eller stäng av annonsblockerare/VPN och försök igen.'
    }, 10000)
    ch.subscribe(async (status, err) => {
      if (err) console.error('[realtime]', status, err)
      if (status === 'SUBSCRIBED') {
        clearTimeout(connectTimer)
        connected.value = true
        await ch.track({ name: me.name, host: isHost })
        if (isHost) hostLobby()
        else {
          ch.send({ type: 'broadcast', event: 'hello', payload: {} })
          setTimeout(() => {
            if (!state.value) error.value = `Hittade inget rum med koden ${code}.`
          }, 5000)
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || (status === 'CLOSED' && !connected.value)) {
        clearTimeout(connectTimer)
        error.value = `Kunde inte ansluta till servern (${status}${err?.message ? ': ' + err.message : ''}).`
      }
    })
    channel.value = ch
  }

  function leave() {
    clearTimeout(revealTimer)
    channel.value?.unsubscribe()
    channel.value = null
  }

  // ---------- Spelare ----------
  function guess(year: number) {
    const s = state.value
    if (!s || s.phase !== 'listen' || myGuess.value?.roundId === s.roundId) return
    myGuess.value = { roundId: s.roundId, year }
    if (isHost) hostGuess(me.id, s.roundId, year)
    else channel.value?.send({ type: 'broadcast', event: 'guess', payload: { id: me.id, roundId: s.roundId, year } })
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

  function hostSettings(total: number, audioAll: boolean, guessSeconds: number) {
    const s = base()
    send({ ...s, total, audioAll, guessSeconds })
  }

  function hostStart() {
    const s = base()
    const players = present.value.map(({ id, name }) => ({ id, name }))
    songs = drawSongs(s.total)
    songIdx = 0
    send({ ...s, players, totals: Object.fromEntries(players.map((p) => [p.id, 0])), round: 0 })
    hostNext()
  }

  async function hostNext() {
    const s = base()
    if (s.round >= s.total) return hostFinal()
    clearTimeout(revealTimer)
    send({ ...s, phase: 'loading', reveal: undefined })
    let clip = null
    while (!clip && songIdx < songs.length) {
      current = songs[songIdx++]
      clip = await findClip(current)
      if (clip) current = { ...current, artwork: clip.artwork }
    }
    if (!clip || !current) {
      error.value = 'Kunde inte hämta fler ljudklipp.'
      return hostFinal()
    }
    // förladda nästa i bakgrunden
    if (songs[songIdx]) findClip(songs[songIdx])
    guesses = {}
    guessTimes = {}
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
    revealTimer = setTimeout(hostReveal, START_DELAY + (CLIP_SECONDS + ns.guessSeconds) * 1000)
  }

  function hostGuess(id: string, roundId: string, year: number) {
    const s = state.value
    if (!s || s.phase !== 'listen' || s.roundId !== roundId || id in guesses) return
    guesses[id] = year
    guessTimes[id] = Math.max(0, Date.now() - hostStartAt)
    const allIn = s.players.every((p) => p.id in guesses)
    if (allIn) {
      clearTimeout(revealTimer)
      // vänta tills klippet spelat klart innan vi avslöjar
      const wait = Math.max(0, hostStartAt + CLIP_SECONDS * 1000 - Date.now())
      revealTimer = setTimeout(hostReveal, wait)
    }
  }

  function hostReveal() {
    const s = base()
    if (s.phase !== 'listen' || !current) return
    const g: Record<string, number | null> = {}
    const pts: Record<string, number> = {}
    const bonus: Record<string, number> = {}
    const totals = { ...s.totals }
    const windowMs = (CLIP_SECONDS + s.guessSeconds) * 1000
    for (const p of s.players) {
      g[p.id] = guesses[p.id] ?? null
      const speed = p.id in guessTimes ? speedFactor(guessTimes[p.id], windowMs) : null
      pts[p.id] = points(g[p.id], current.y, speed)
      bonus[p.id] = speedBonus(g[p.id], current.y, speed)
      totals[p.id] = (totals[p.id] ?? 0) + pts[p.id]
    }
    send({
      ...s,
      phase: 'reveal',
      totals,
      reveal: { a: current.a, t: current.t, y: current.y, artwork: current.artwork, guesses: g, pts, bonus },
    })
  }

  function hostFinal() {
    clearTimeout(revealTimer)
    send({ ...base(), phase: 'final' })
  }

  function hostAgain() {
    clearTimeout(revealTimer)
    send({ ...base(), phase: 'lobby', round: 0, totals: {}, reveal: undefined })
    hostLobby()
  }

  return {
    me,
    state,
    present,
    connected,
    error,
    startAt,
    myGuess,
    onState,
    connect,
    leave,
    guess,
    hostSettings,
    hostStart,
    hostNext,
    hostReveal,
    hostFinal,
    hostAgain,
  }
}
