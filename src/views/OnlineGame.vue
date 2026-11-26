<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import Vinyl from '../components/Vinyl.vue'
import YearSlider from '../components/YearSlider.vue'
import Standings from '../components/Standings.vue'
import { CLIP_SECONDS, playClip, stopClip, unlockAudio } from '../lib/audio'
import { verdict, yearDiff } from '../lib/game'
import { CODE_LENGTH, makeCode, useRoom } from '../lib/room'
import { useNow } from '../lib/useNow'

const props = defineProps<{ mode: 'host' | 'join' }>()
defineEmits<{ exit: [] }>()
const isHost = props.mode === 'host'

let savedName = ''
try { savedName = localStorage.getItem('ag-name') ?? '' } catch { /* */ }
const name = ref(savedName)
const code = ref(isHost ? makeCode() : '')
const codeOk = computed(() => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.value.trim()))
const room = shallowRef<ReturnType<typeof useRoom> | null>(null)
const year = ref(1992)
const blocked = ref(false)
const now = useNow()

// värdens inställningar
const count = ref(10)
const audioAll = ref(true)
const guessSeconds = ref(20)

async function enter() {
  if (!name.value.trim() || !codeOk.value) return
  await unlockAudio()
  try { localStorage.setItem('ag-name', name.value.trim()) } catch { /* */ }
  const r = useRoom(code.value.trim(), name.value.trim(), isHost)
  room.value = r
  r.onState.value = onState
  r.connect()
}

let lastRound = ''
function onState() {
  const r = room.value!
  const s = r.state.value!
  if (s.phase === 'listen' && s.roundId !== lastRound) {
    lastRound = s.roundId
    year.value = 1992
    if (s.audioAll || isHost) startAudio()
  }
  if (s.phase !== 'listen') stopClip()
}

async function startAudio() {
  const r = room.value!
  const s = r.state.value!
  if (!s.clipUrl) return
  blocked.value = false
  const ok = await playClip(s.clipUrl, r.startAt.value)
  if (!ok && Date.now() - r.startAt.value < CLIP_SECONDS * 1000 - 500) blocked.value = true
}

watch([count, audioAll, guessSeconds], () => room.value?.hostSettings(count.value, audioAll.value, guessSeconds.value))
watch(
  () => room.value?.connected.value,
  (c) => c && isHost && room.value?.hostSettings(count.value, audioAll.value, guessSeconds.value),
)

const s = computed(() => room.value?.state.value ?? null)
const me = computed(() => room.value?.me)
const inGame = computed(() => !!s.value?.players.some((p) => p.id === me.value?.id))
const elapsed = computed(() => (room.value ? now.value - room.value.startAt.value : 0))
const countdown = computed(() => Math.ceil(-elapsed.value / 1000))
const progress = computed(() => Math.min(1, Math.max(0, elapsed.value / (CLIP_SECONDS * 1000))))
const guessLeft = computed(() =>
  s.value ? Math.max(0, Math.ceil(CLIP_SECONDS + s.value.guessSeconds - elapsed.value / 1000)) : 0,
)
const locked = computed(() => room.value?.myGuess.value?.roundId === s.value?.roundId)
const hearsAudio = computed(() => !!s.value && (s.value.audioAll || isHost))
const revealRows = computed(() => {
  const st = s.value
  if (!st?.reveal) return []
  return st.players
    .map((p) => {
      const g = st.reveal!.guesses[p.id]
      return { ...p, g, diff: yearDiff(g, st.reveal!.y), pts: st.reveal!.pts[p.id] ?? 0, bonus: st.reveal!.bonus?.[p.id] ?? 0 }
    })
    .sort((a, b) => b.pts - a.pts)
})

function lock() {
  room.value?.guess(year.value)
}
function copyCode() {
  navigator.clipboard?.writeText(code.value).catch(() => {})
}

onBeforeUnmount(() => {
  stopClip()
  room.value?.leave()
})
</script>

<template>
  <div class="topbar">
    <button class="back" @click="$emit('exit')">← Lämna</button>
    <span v-if="s && s.round" class="muted small">Låt {{ s.round }} av {{ s.total }}</span>
    <span v-else-if="room" class="muted small">Rum {{ code }}</span>
  </div>

  <!-- ANSLUT -->
  <template v-if="!room">
    <h2>{{ isHost ? 'Skapa rum' : 'Gå med i rum' }}</h2>
    <form class="card stack" @submit.prevent="enter">
      <label class="field">Ditt namn
        <input id="name" v-model="name" type="text" maxlength="16" autocomplete="nickname" placeholder="T.ex. Elvin" />
      </label>
      <label v-if="!isHost" class="field">Rumskod
        <input id="code" v-model="code" type="text" class="code" :maxlength="CODE_LENGTH" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="1234" @input="code = code.replace(/\D/g, '')" />
      </label>
      <button id="enter" class="btn" :class="{ pink: isHost }" :disabled="!name.trim() || !codeOk">
        {{ isHost ? 'Skapa' : 'Gå med' }}
      </button>
    </form>
  </template>

  <p v-else-if="room.error.value" class="error">{{ room.error.value }}</p>
  <p v-else-if="!room.connected.value || !s" class="center muted">Ansluter till rummet…</p>

  <Transition name="toast">
    <div v-if="room?.reconnecting.value && !room.error.value" class="toast" role="status">
      <span class="dot" aria-hidden="true" /> Anslutningen bröts – återansluter…
    </div>
  </Transition>

  <template v-if="room && s">
    <!-- LOBBY -->
    <template v-if="s.phase === 'lobby'">
      <section class="card center stack">
        <p class="muted">Rumskod</p>
        <button class="roomcode" @click="copyCode" aria-label="Kopiera rumskod">{{ code }}</button>
        <p class="muted small">Alla öppnar appen, väljer ”Gå med i rum” och skriver koden.</p>
      </section>
      <section class="card stack">
        <h3>Spelare ({{ room.present.value.length }})</h3>
        <ul class="list">
          <li v-for="p in room.present.value" :key="p.id">
            <strong>{{ p.name }}</strong>
            <span v-if="p.host" class="tag gold">värd</span>
            <span v-if="p.id === me?.id" class="tag mint">du</span>
          </li>
        </ul>
      </section>
      <template v-if="isHost">
        <section class="card stack">
          <div class="row"><h3 class="grow">Antal låtar</h3><span class="big">{{ count }}</span></div>
          <input id="count" v-model.number="count" type="range" min="10" max="100" step="5" class="plain" aria-label="Antal låtar" />
          <h3>Ljud</h3>
          <div class="row">
            <button class="chip" :class="{ on: audioAll }" @click="audioAll = true">Alla mobiler</button>
            <button class="chip" :class="{ on: !audioAll }" @click="audioAll = false">Bara min (högtalare)</button>
          </div>
          <h3>Tid att gissa efter låten</h3>
          <div class="row">
            <button v-for="n in [10, 20, 30]" :key="n" class="chip" :class="{ on: guessSeconds === n }" @click="guessSeconds = n">{{ n }} s</button>
          </div>
        </section>
        <button id="start-online" class="btn" :disabled="room.present.value.length < 1" @click="room.hostStart()">Starta spelet</button>
      </template>
      <p v-else class="center muted">Väntar på att värden startar…</p>
    </template>

    <!-- LADDAR -->
    <template v-else-if="s.phase === 'loading'">
      <Vinyl :progress="0" />
      <p class="center muted">Värden letar fram nästa skiva…</p>
    </template>

    <!-- LYSSNA + GISSA -->
    <template v-else-if="s.phase === 'listen'">
      <Vinyl
        :playing="hearsAudio && elapsed > 0 && progress < 1 && !blocked"
        :progress="progress"
        :label="countdown > 0 ? String(countdown) : ''"
      />
      <div class="center">
        <button v-if="blocked" class="btn pink" @click="startAudio">Tryck för att spela</button>
        <p v-else-if="countdown > 0" class="muted">Låten startar om {{ countdown }}…</p>
        <p v-else-if="progress < 1" class="muted">{{ hearsAudio ? 'Lyssna!' : 'Lyssna på högtalaren!' }}</p>
        <p v-else class="muted">{{ guessLeft }} s kvar att gissa</p>
      </div>
      <section v-if="inGame && !locked" class="card stack">
        <YearSlider v-model="year" />
        <button id="lock" class="btn" @click="lock">Lås {{ year }}</button>
      </section>
      <section v-else-if="inGame" class="card center stack">
        <p>Du gissade <strong>{{ room.myGuess.value?.year }}</strong></p>
        <p class="muted small">Väntar på de andra…</p>
      </section>
      <p v-else class="center muted">Du tittar på den här omgången.</p>
    </template>

    <!-- AVSLÖJANDE -->
    <template v-else-if="s.phase === 'reveal' && s.reveal">
      <Vinyl :artwork="s.reveal.artwork" />
      <div class="center stack answer">
        <div class="big-year">{{ s.reveal.y }}</div>
        <h3>{{ s.reveal.t }}</h3>
        <p class="muted">{{ s.reveal.a }}</p>
      </div>
      <ul class="list">
        <li v-for="r in revealRows" :key="r.id">
          <strong>{{ r.name }}</strong>
          <span class="muted">{{ r.g ?? 'ingen gissning' }}</span>
          <span class="tag" :class="{ gold: r.diff != null && r.diff <= 2 }">{{ verdict(r.diff) }}</span>
          <span class="pts">+{{ r.pts }}<small v-if="r.bonus" class="muted" title="Snabbhetsbonus"> ⚡{{ r.bonus }}</small></span>
        </li>
      </ul>
      <h3>Ställning</h3>
      <Standings :players="s.players" :totals="s.totals" :me-id="me?.id" />
      <button v-if="isHost" id="next" class="btn" @click="s.round >= s.total ? room.hostFinal() : room.hostNext()">
        {{ s.round >= s.total ? 'Visa slutresultat' : 'Nästa låt' }}
      </button>
      <p v-else class="center muted">Väntar på värden…</p>
    </template>

    <!-- SLUT -->
    <template v-else-if="s.phase === 'final'">
      <h2>Slutresultat</h2>
      <Standings :players="s.players" :totals="s.totals" :me-id="me?.id" final />
      <p class="muted small center">Flest poäng vinner. Upp till 100 p per låt för rätt år, plus upp till 50 p för att svara snabbt.</p>
      <button v-if="isHost" class="btn" @click="room.hostAgain()">Ny omgång i samma rum</button>
      <button class="btn ghost" @click="$emit('exit')">Till start</button>
    </template>
  </template>
</template>

<style scoped>
.toast {
  position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; z-index: 10; max-width: calc(100% - 32px);
  padding: 10px 16px; border-radius: 999px; background: rgba(20, 10, 45, .92); color: var(--ink);
  font-size: 14px; box-shadow: 0 6px 20px rgba(0,0,0,.4); white-space: nowrap;
}
.toast .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .25; } }
.toast-enter-active, .toast-leave-active { transition: opacity .25s, transform .25s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 12px); }
.roomcode {
  background: none; border: 0; cursor: pointer; color: var(--gold);
  font: 800 clamp(48px, 16vw, 68px)/1 Unbounded, sans-serif; letter-spacing: .12em;
}
.big { font: 800 28px Unbounded, sans-serif; color: var(--gold); }
.answer { gap: 6px; }
input.plain { width: 100%; accent-color: var(--gold); height: 36px; }
</style>
