<script setup lang="ts">
import { ref } from 'vue'
import Vinyl from '../components/Vinyl.vue'
import LangSelect from '../components/LangSelect.vue'
import { supabase } from '../lib/room'
import { unlockAudio } from '../lib/audio'
import { clearSession, loadSession, type Session } from '../lib/session'
import { t } from '../i18n'
const emit = defineEmits<{ go: [view: 'local' | 'host' | 'join']; resume: [session: Session] }>()
const online = !!supabase

/** Ett onlinespel som inte avslutades (appen kraschade eller stängdes) */
const active = ref(online ? loadSession() : null)

function rejoin() {
  if (!active.value) return
  unlockAudio() // i samma tryck, annars tillåter iOS inte ljud
  emit('resume', active.value)
}
function forget() {
  clearSession()
  active.value = null
}
</script>

<template>
  <div class="lang-row"><LangSelect /></div>
  <header class="stack center hero">
    <h1>{{ t('app.title') }}</h1>
    <p class="muted">{{ t('home.intro1') }}<br /></p>
  </header>

  <section v-if="active" id="active-game" class="card stack resume">
    <div>
      <strong>{{ t('home.activeGame') }}</strong>
      <p class="muted small">
        {{ t('online.room', { code: active.code }) }} · {{ active.name }}<template v-if="active.host"> · {{ t('online.host') }}</template>
      </p>
    </div>
    <div class="row">
      <button id="rejoin" class="btn grow" @click="rejoin">{{ t('home.rejoin') }}</button>
      <button id="forget" class="btn ghost" @click="forget">{{ t('home.leaveGame') }}</button>
    </div>
  </section>

  <Vinyl playing :progress="0.72" />
  <div class="spacer" />
  <div class="stack">
    <button id="btn-local" class="btn" @click="$emit('go', 'local')">{{ t('home.local') }}</button>
    <button id="btn-host" class="btn pink" :disabled="!online" @click="$emit('go', 'host')">{{ t('home.host') }}</button>
    <button id="btn-join" class="btn ghost" :disabled="!online" @click="$emit('go', 'join')">{{ t('home.join') }}</button>
    <p v-if="!online" class="muted small center">{{ t('home.noOnline') }}</p>
  </div>
</template>

<style scoped>
.lang-row { display: flex; justify-content: flex-end; }
.hero { padding-top: 4px; gap: 10px; }
.resume { border: 2px solid var(--gold); gap: 12px; }
.resume .row { flex-wrap: nowrap; }
.resume .btn { min-height: 48px; }
.grow { flex: 1; }
</style>
