<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import Vinyl from '../components/Vinyl.vue'
import YearSlider from '../components/YearSlider.vue'
import Standings from '../components/Standings.vue'
import { CLIP_SECONDS, playClip, stopClip, unlockAudio } from '../lib/audio'
import { verdict, yearDiff } from '../lib/game'
import { CODE_LENGTH, clipLength, guessWindow, makeCode, useRoom } from '../lib/room'
import ListSelect from '../components/ListSelect.vue'
import { listName, t } from '../i18n'
import { DEFAULT_LIST, getList, type ListId } from '../lib/songs'
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
const guessDuring = ref(false)
const clipSeconds = ref(CLIP_SECONDS)
const list = ref<ListId>(DEFAULT_LIST)

// I läget "direkt" måste gissningstiden räcka hela låten – justera det andra valet automatiskt
function setClip(n: number) {
  clipSeconds.value = n
  if (guessDuring.value && guessSeconds.value < n) guessSeconds.value = n
}
function setGuess(n: number) {
  guessSeconds.value = n
  if (guessDuring.value && clipSeconds.value > n) clipSeconds.value = n
}
function setDuring(d: boolean) {
  guessDuring.value = d
  if (d && guessSeconds.value < clipSeconds.value) guessSeconds.value = clipSeconds.value
}
/** Lås-knappen är inaktiv tills spelaren själv har rört årshjulet den här omgången */
const touched = ref(false)

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
    touched.value = false
    if (s.audioAll || isHost) startAudio()
  }
  if (s.phase !== 'listen') stopClip()
}

async function startAudio() {
  const r = room.value!
  const s = r.state.value!
  if (!s.clipUrl) return
  blocked.value = false
  const ok = await playClip(s.clipUrl, r.startAt.value, undefined, clipLength(s))
  if (!ok && Date.now() - r.startAt.value < clipLength(s) * 1000 - 500) blocked.value = true
}

// Skicka året på hjulet löpande, så det räknas om man glömmer trycka Klar!
watch([year, touched], ([y, t]) => {
  if (t) room.value?.draft(y)
})

const pushSettings = () =>
  room.value?.hostSettings({
    total: count.value,
    audioAll: audioAll.value,
    guessSeconds: guessSeconds.value,
    guessDuring: guessDuring.value,
    clipSeconds: clipSeconds.value,
    list: list.value,
  })
watch([count, audioAll, guessSeconds, guessDuring, clipSeconds, list], pushSettings)
watch(
  () => room.value?.connected.value,
  (c) => c && isHost && pushSettings(),
)

const s = computed(() => room.value?.state.value ?? null)
const me = computed(() => room.value?.me)
const inGame = computed(() => !!s.value?.players.some((p) => p.id === me.value?.id))
const elapsed = computed(() => (room.value ? now.value - room.value.startAt.value : 0))
const countdown = computed(() => Math.ceil(-elapsed.value / 1000))
const progress = computed(() =>
  s.value ? Math.min(1, Math.max(0, elapsed.value / (clipLength(s.value) * 1000))) : 0,
)
const win = computed(() => (s.value ? guessWindow(s.value) : { opens: 0, closes: 0 }))
const guessOpen = computed(() => elapsed.value >= win.value.opens * 1000)
const guessLeft = computed(() => Math.max(0, Math.ceil(win.value.closes - elapsed.value / 1000)))
const canLock = computed(() => touched.value && guessOpen.value && guessLeft.value > 0)
const lockLabel = computed(() =>
  !guessOpen.value
    ? t(s.value?.guessDuring ? 'online.waitSong' : 'online.guessAfterSong')
    : t(touched.value ? 'common.done' : 'common.dragToPick'),
)
const locked = computed(() => room.value?.myGuess.value?.roundId === s.value?.roundId)
const hearsAudio = computed(() => !!s.value && (s.value.audioAll || isHost))
const revealRows = computed(() => {
  const st = s.value
  if (!st?.reveal) return []
  return st.players
    .map((p) => {
      const g = st.reveal!.guesses[p.id]
      return {
        ...p, g, diff: yearDiff(g, st.reveal!.y), pts: st.reveal!.pts[p.id] ?? 0,
        bonus: st.reveal!.bonus?.[p.id] ?? 0, auto: !!st.reveal!.auto?.[p.id],
      }
    })
    .sort((a, b) => b.pts - a.pts)
})

function lock() {
  if (!canLock.value) return
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
    <button class="back" @click="$emit('exit')">{{ t('common.leave') }}</button>
    <span v-if="s && s.round" class="muted small">{{ t('common.songOf', { n: s.round, total: s.total }) }}</span>
    <span v-else-if="room" class="muted small">{{ t('online.room', { code }) }}</span>
  </div>

  <!-- ANSLUT -->
  <template v-if="!room">
    <h2>{{ t(isHost ? 'home.host' : 'home.join') }}</h2>
    <form class="card stack" @submit.prevent="enter">
      <label class="field">{{ t('online.yourName') }}
        <input id="name" v-model="name" type="text" maxlength="16" autocomplete="nickname" :placeholder="t('online.namePlaceholder')" />
      </label>
      <label v-if="!isHost" class="field">{{ t('online.roomCode') }}
        <input id="code" v-model="code" type="text" class="code" :maxlength="CODE_LENGTH" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="1234" @input="code = code.replace(/\D/g, '')" />
      </label>
      <button id="enter" class="btn" :class="{ pink: isHost }" :disabled="!name.trim() || !codeOk">
        {{ t(isHost ? 'online.create' : 'online.join') }}
      </button>
    </form>
  </template>

  <p v-else-if="room.error.value" class="error">{{ t(room.error.value.key, room.error.value.params) }}</p>
  <p v-else-if="!room.connected.value || !s" class="center muted">{{ t('online.connecting') }}</p>

  <Transition name="toast">
    <div v-if="room?.reconnecting.value && !room.error.value" class="toast" role="status">
      <span class="dot" aria-hidden="true" /> {{ t('online.reconnecting') }}
    </div>
  </Transition>

  <template v-if="room && s">
    <!-- LOBBY -->
    <template v-if="s.phase === 'lobby'">
      <section class="card center stack">
        <p class="muted">{{ t('online.roomCode') }}</p>
        <button class="roomcode" @click="copyCode" :aria-label="t('online.copyCode')">{{ code }}</button>
        <p class="muted small">{{ t('online.shareHint', { join: t('home.join') }) }}</p>
        <p v-if="!isHost" class="small">{{ t('online.listIs') }} <strong>{{ getList(s.list).flag }} {{ listName(getList(s.list).id) }}</strong></p>
      </section>
      <section class="card stack">
        <h3>{{ t('online.players', { n: room.present.value.length }) }}</h3>
        <ul class="list">
          <li v-for="p in room.present.value" :key="p.id">
            <strong>{{ p.name }}</strong>
            <span v-if="p.host" class="tag gold">{{ t('online.host') }}</span>
            <span v-if="p.id === me?.id" class="tag mint">{{ t('common.you') }}</span>
          </li>
        </ul>
      </section>
      <template v-if="isHost">
        <section class="card stack">
          <h3>{{ t('common.songList') }}</h3>
          <ListSelect v-model="list" />
          <div class="row"><h3 class="grow">{{ t('common.songCount') }}</h3><span class="big">{{ count }}</span></div>
          <input id="count" v-model.number="count" type="range" min="10" max="100" step="5" class="plain" :aria-label="t('common.songCount')" />
          <h3>{{ t('online.audio') }}</h3>
          <div class="row">
            <button class="chip" :class="{ on: audioAll }" @click="audioAll = true">{{ t('online.audioAll') }}</button>
            <button class="chip" :class="{ on: !audioAll }" @click="audioAll = false">{{ t('online.audioHost') }}</button>
          </div>
          <h3>{{ t('online.clipLength') }}</h3>
          <div class="row">
            <button v-for="n in [10, 20, 30]" :key="n" class="chip" :class="{ on: clipSeconds === n }" @click="setClip(n)">{{ t('common.seconds', { n }) }}</button>
          </div>
          <h3>{{ t('online.whenGuess') }}</h3>
          <div class="row">
            <button class="chip" :class="{ on: !guessDuring }" @click="setDuring(false)">{{ t('online.after') }}</button>
            <button class="chip" :class="{ on: guessDuring }" @click="setDuring(true)">{{ t('online.during') }}</button>
          </div>
          <p class="muted small">{{ t(guessDuring ? 'online.duringHelp' : 'online.afterHelp') }}</p>
          <h3>{{ t(guessDuring ? 'online.guessTimeDuring' : 'online.guessTimeAfter') }}</h3>
          <div class="row">
            <button v-for="n in [10, 20, 30]" :key="n" class="chip" :class="{ on: guessSeconds === n }" @click="setGuess(n)">{{ t('common.seconds', { n }) }}</button>
          </div>
        </section>
        <button id="start-online" class="btn" :disabled="room.present.value.length < 1" @click="room.hostStart()">{{ t('online.startGame') }}</button>
      </template>
      <p v-else class="center muted">{{ t('online.waitingStart') }}</p>
    </template>

    <!-- LADDAR -->
    <template v-else-if="s.phase === 'loading'">
      <Vinyl :progress="0" />
      <p class="center muted">{{ t('online.hostLoading') }}</p>
    </template>

    <!-- LYSSNA + GISSA -->
    <template v-else-if="s.phase === 'listen'">
      <Vinyl
        :playing="hearsAudio && elapsed > 0 && progress < 1 && !blocked"
        :progress="progress"
        :label="countdown > 0 ? String(countdown) : ''"
      />
      <div class="center">
        <button v-if="blocked" class="btn pink" @click="startAudio">{{ t('common.tapToPlay') }}</button>
        <p v-else-if="countdown > 0" class="muted">{{ t('online.startsIn', { n: countdown }) }}</p>
        <p v-else-if="guessOpen" class="muted">
          {{ progress < 1 ? t(hearsAudio ? 'online.listenGuess' : 'online.listenSpeakerGuess') + ' ' : '' }}{{ t('online.secondsLeft', { n: guessLeft }) }}
        </p>
        <p v-else class="muted">{{ t(hearsAudio ? 'online.listen' : 'online.listenSpeaker') }}</p>
      </div>
      <section v-if="inGame && !locked" class="card stack">
        <YearSlider v-model="year" @interact="touched = true" />
        <button id="lock" class="btn" :disabled="!canLock" @click="lock">{{ lockLabel }}</button>
      </section>
      <section v-else-if="inGame" class="card center stack">
        <p>{{ t('online.youGuessed') }} <strong>{{ room.myGuess.value?.year }}</strong></p>
        <p class="muted small">{{ t('online.waitingOthers') }}</p>
      </section>
      <p v-else class="center muted">{{ t('online.spectating') }}</p>
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
          <span class="muted">{{ r.g ?? t('online.noGuess') }}<small v-if="r.auto" :title="t('online.notDoneTitle')"> · {{ t('online.notDone') }}</small></span>
          <span class="tag" :class="{ gold: r.diff != null && r.diff <= 2 }">{{ t(verdict(r.diff)) }}</span>
          <span class="pts">+{{ r.pts }}<small v-if="r.bonus" class="muted" :title="t('online.speedBonus')"> ⚡{{ r.bonus }}</small></span>
        </li>
      </ul>
      <h3>{{ t('common.standings') }}</h3>
      <Standings :players="s.players" :totals="s.totals" :me-id="me?.id" />
      <button v-if="isHost" id="next" class="btn" @click="s.round >= s.total ? room.hostFinal() : room.hostNext()">
        {{ t(s.round >= s.total ? 'common.showFinal' : 'common.nextSong') }}
      </button>
      <p v-else class="center muted">{{ t('online.waitingHost') }}</p>
    </template>

    <!-- SLUT -->
    <template v-else-if="s.phase === 'final'">
      <h2>{{ t('common.finalResults') }}</h2>
      <Standings :players="s.players" :totals="s.totals" :me-id="me?.id" final />
      <p class="muted small center">{{ t('online.finalNote') }}</p>
      <button v-if="isHost" class="btn" @click="room.hostAgain()">{{ t('online.again') }}</button>
      <button class="btn ghost" @click="$emit('exit')">{{ t('common.toStart') }}</button>
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
