<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import Vinyl from '../components/Vinyl.vue'
import YearSlider from '../components/YearSlider.vue'
import Standings from '../components/Standings.vue'
import { CLIP_SECONDS, playClip, stopClip, unlockAudio } from '../lib/audio'
import { drawSongs, points, verdict, yearDiff } from '../lib/game'
import { correctedYear, findClip, type Clip } from '../lib/itunes'
import ListSelect from '../components/ListSelect.vue'
import { t, type MessageKey } from '../i18n'
import { DEFAULT_LIST, getList, loadSongs, type ListId, type Song } from '../lib/songs'
import { useNow } from '../lib/useNow'

defineEmits<{ exit: [] }>()
type Phase = 'setup' | 'loading' | 'play' | 'reveal' | 'final'
const MID = 1992

const phase = ref<Phase>('setup')
const players = ref([{ id: 'p1', name: t('local.playerN', { n: 1 }) }])
const count = ref(10)
const list = ref<ListId>(DEFAULT_LIST)
const round = ref(0)
const totals = ref<Record<string, number>>({})
const guesses = ref<Record<string, number>>({})
const turn = ref(0)
const year = ref(MID)
/** Lås-knappen är inaktiv tills spelaren själv har rört årshjulet */
const touched = ref(false)
const blocked = ref(false)
const error = ref<MessageKey | null>(null)
const now = useNow()

let songs: Song[] = []
let songIdx = 0
const current = ref<(Song & Clip) | null>(null)
const startAt = ref(0)

let nextId = 2
function addPlayer() {
  players.value.push({ id: 'p' + nextId, name: t('local.playerN', { n: nextId }) })
  nextId++
}
function removePlayer(i: number) {
  if (players.value.length > 1) players.value.splice(i, 1)
}

const progress = computed(() =>
  phase.value === 'play' && startAt.value ? Math.min(1, (now.value - startAt.value) / (CLIP_SECONDS * 1000)) : 0,
)
const clipPlaying = computed(() => phase.value === 'play' && progress.value > 0 && progress.value < 1 && !blocked.value)
const guesser = computed(() => players.value[turn.value])
const allGuessed = computed(() => turn.value >= players.value.length)

async function start() {
  await unlockAudio()
  players.value = players.value.map((p, i) => ({ ...p, name: p.name.trim() || t('local.playerN', { n: i + 1 }) }))
  totals.value = Object.fromEntries(players.value.map((p) => [p.id, 0]))
  phase.value = 'loading'
  try {
    songs = drawSongs(await loadSongs(list.value), count.value)
  } catch {
    error.value = 'err.list'
    return finish()
  }
  songIdx = 0
  round.value = 0
  next()
}

async function next() {
  if (round.value >= count.value) return finish()
  phase.value = 'loading'
  error.value = null
  let clip: Clip | null = null
  let song: Song | undefined
  while (!clip && songIdx < songs.length) {
    song = songs[songIdx++]
    clip = await findClip(song, getList(list.value).countries)
  }
  if (!clip || !song) {
    error.value = 'local.errClips'
    return finish()
  }
  if (songs[songIdx]) findClip(songs[songIdx], getList(list.value).countries) // förladda nästa
  current.value = { ...song, ...clip, y: correctedYear(song, clip) }
  guesses.value = {}
  turn.value = 0
  year.value = MID
  touched.value = false
  round.value++
  phase.value = 'play'
  play()
}

async function play() {
  if (!current.value) return
  blocked.value = false
  startAt.value = Date.now() + 300
  const ok = await playClip(current.value.previewUrl, startAt.value)
  if (!ok && Date.now() - startAt.value < 1000) blocked.value = true
}

function lock() {
  if (!guesser.value || !touched.value) return
  guesses.value[guesser.value.id] = year.value
  turn.value++
  year.value = MID
  touched.value = false
}

function reveal() {
  stopClip()
  const c = current.value!
  for (const p of players.value) totals.value[p.id] += points(guesses.value[p.id], c.y)
  phase.value = 'reveal'
}

function finish() {
  stopClip()
  phase.value = 'final'
}

onBeforeUnmount(stopClip)
</script>

<template>
  <div class="topbar">
    <button class="back" @click="$emit('exit')">{{ t('common.exit') }}</button>
    <span v-if="round" class="muted small">{{ t('common.songOf', { n: round, total: count }) }}</span>
  </div>

  <!-- INSTÄLLNINGAR -->
  <template v-if="phase === 'setup'">
    <h2>{{ t('local.title') }}</h2>
    <p class="muted">{{ t('local.intro') }}</p>
    <section class="card stack">
      <h3>{{ t('local.players') }}</h3>
      <div v-for="(p, i) in players" :key="p.id" class="row">
        <input :id="'name-' + p.id" v-model="p.name" type="text" class="grow" maxlength="16" :aria-label="t('local.playerNameAria', { n: i + 1 })" />
        <button class="btn ghost small" :disabled="players.length === 1" @click="removePlayer(i)" :aria-label="t('local.remove')">✕</button>
      </div>
      <button class="btn ghost small" :disabled="players.length >= 10" @click="addPlayer">{{ t('local.addPlayer') }}</button>
    </section>
    <section class="card stack">
      <h3>{{ t('common.songList') }}</h3>
      <ListSelect v-model="list" />
      <div class="row"><h3 class="grow">{{ t('common.songCount') }}</h3><span class="big">{{ count }}</span></div>
      <input id="count" v-model.number="count" type="range" min="10" max="100" step="5" class="plain" :aria-label="t('common.songCount')" />
      <div class="row">
        <button v-for="n in [10, 20, 30, 50, 100]" :key="n" class="chip" :class="{ on: count === n }" @click="count = n">{{ n }}</button>
      </div>
    </section>
    <button id="start-local" class="btn" @click="start">{{ t('local.start') }}</button>
  </template>

  <!-- LADDAR -->
  <template v-else-if="phase === 'loading'">
    <Vinyl :progress="0" />
    <p class="center muted">{{ t('common.loadingNext') }}</p>
  </template>

  <!-- SPELA + GISSA -->
  <template v-else-if="phase === 'play' && current">
    <Vinyl :playing="clipPlaying" :progress="progress" />
    <div class="center">
      <button v-if="blocked" class="btn pink" @click="play">{{ t('common.tapToPlay') }}</button>
      <p v-else-if="progress < 1" class="muted">{{ t('local.listening', { s: Math.max(0, Math.ceil(CLIP_SECONDS - progress * CLIP_SECONDS)) }) }}</p>
      <p v-else class="muted">{{ t('local.songOver') }}</p>
    </div>
    <section v-if="!allGuessed" class="card stack">
      <p class="center"><strong>{{ guesser!.name }}</strong> <span class="muted">{{ t('local.isGuessing') }}</span></p>
      <YearSlider :key="guesser!.id" v-model="year" @interact="touched = true" />
      <button id="lock" class="btn" :disabled="!touched" @click="lock">{{ t(touched ? 'common.done' : 'common.dragToPick') }}</button>
    </section>
    <section v-else class="card stack center">
      <p>{{ t('local.allGuessed') }}</p>
      <button id="reveal" class="btn pink" @click="reveal">{{ t('local.showAnswer') }}</button>
    </section>
  </template>

  <!-- AVSLÖJANDE -->
  <template v-else-if="phase === 'reveal' && current">
    <Vinyl :artwork="current.artwork" />
    <div class="center stack answer">
      <div class="big-year">{{ current.y }}</div>
      <h3>{{ current.t }}</h3>
      <p class="muted">{{ current.a }}</p>
    </div>
    <ul class="list">
      <li v-for="p in players" :key="p.id">
        <strong>{{ p.name }}</strong>
        <span class="muted">{{ guesses[p.id] }}</span>
        <span class="tag" :class="{ gold: (yearDiff(guesses[p.id], current.y) ?? 99) <= 2 }">{{ t(verdict(yearDiff(guesses[p.id], current.y))) }}</span>
        <span class="pts">+{{ points(guesses[p.id], current.y) }}</span>
      </li>
    </ul>
    <template v-if="players.length > 1">
      <h3>{{ t('common.standings') }}</h3>
      <Standings :players="players" :totals="totals" />
    </template>
    <p v-else class="center muted">{{ t('local.total', { n: totals[players[0].id] }) }}</p>
    <button id="next" class="btn" @click="round >= count ? finish() : next()">
      {{ t(round >= count ? 'common.showFinal' : 'common.nextSong') }}
    </button>
  </template>

  <!-- SLUT -->
  <template v-else-if="phase === 'final'">
    <h2>{{ t('common.finalResults') }}</h2>
    <p v-if="error" class="error">{{ t(error) }}</p>
    <Standings :players="players" :totals="totals" final />
    <p class="muted small center">{{ t('local.finalNote', { n: round ? Math.round(Math.max(...Object.values(totals)) / round) : 0 }) }}</p>
    <div class="stack">
      <button class="btn" @click="start">{{ t('local.playAgain') }}</button>
      <button class="btn ghost" @click="$emit('exit')">{{ t('common.toStart') }}</button>
    </div>
  </template>
</template>

<style scoped>
.big { font: 800 28px Unbounded, sans-serif; color: var(--gold); }
.answer { gap: 6px; }
input.plain { width: 100%; accent-color: var(--gold); height: 36px; }
</style>
