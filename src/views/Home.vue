<script setup lang="ts">
import Vinyl from '../components/Vinyl.vue'
import { supabase } from '../lib/room'
import { LISTS } from '../lib/songs'
defineEmits<{ go: [view: 'local' | 'host' | 'join'] }>()
const online = !!supabase
</script>

<template>
  <header class="stack center hero">
    <h1>Gissa året</h1>
    <p class="muted">Lyssna 10 sekunder. Dra skalan till rätt år.<br />Rätt år ger 100 poäng – och online vinner den som svarar snabbt extra. Flest poäng vinner.</p>
  </header>
  <Vinyl playing :progress="0.72" />
  <div class="spacer" />
  <div class="stack">
    <button id="btn-local" class="btn" @click="$emit('go', 'local')">Spela på en mobil</button>
    <button id="btn-host" class="btn pink" :disabled="!online" @click="$emit('go', 'host')">Skapa rum</button>
    <button id="btn-join" class="btn ghost" :disabled="!online" @click="$emit('go', 'join')">Gå med i rum</button>
    <p v-if="!online" class="muted small center">Onlineläget kräver Supabase-nycklar i <code>.env</code>.</p>
    <p class="muted small center">Tusentals låtar från 1960 till idag · {{ LISTS.map((l) => l.flag).join(' ') }} · Ljudklipp från iTunes</p>
  </div>
</template>

<style scoped>
.hero { padding-top: 12px; gap: 10px; }
</style>
