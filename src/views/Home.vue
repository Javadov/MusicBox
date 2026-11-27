<script setup lang="ts">
import Vinyl from '../components/Vinyl.vue'
import LangSelect from '../components/LangSelect.vue'
import { supabase } from '../lib/room'
import { LISTS } from '../lib/songs'
import { t } from '../i18n'
defineEmits<{ go: [view: 'local' | 'host' | 'join'] }>()
const online = !!supabase
</script>

<template>
  <div class="lang-row"><LangSelect /></div>
  <header class="stack center hero">
    <h1>{{ t('app.title') }}</h1>
    <p class="muted">{{ t('home.intro1') }}<br />{{ t('home.intro2') }}</p>
  </header>
  <Vinyl playing :progress="0.72" />
  <div class="spacer" />
  <div class="stack">
    <button id="btn-local" class="btn" @click="$emit('go', 'local')">{{ t('home.local') }}</button>
    <button id="btn-host" class="btn pink" :disabled="!online" @click="$emit('go', 'host')">{{ t('home.host') }}</button>
    <button id="btn-join" class="btn ghost" :disabled="!online" @click="$emit('go', 'join')">{{ t('home.join') }}</button>
    <p v-if="!online" class="muted small center">{{ t('home.noOnline') }}</p>
    <p class="muted small center">{{ t('home.footer', { flags: LISTS.map((l) => l.flag).join(' ') }) }}</p>
  </div>
</template>

<style scoped>
.lang-row { display: flex; justify-content: flex-end; }
.hero { padding-top: 4px; gap: 10px; }
</style>
