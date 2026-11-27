<script setup lang="ts">
import { LISTS, type ListId } from '../lib/songs'
import { listName, t } from '../i18n'

// Vanlig <select>: iOS visar sin egen hjulväljare, datorn en lista – skalar till hur många språk som helst.
const model = defineModel<ListId>({ required: true })
</script>

<template>
  <div class="ls">
    <select id="song-list" v-model="model" :aria-label="t('common.songList')">
      <option v-for="l in LISTS" :key="l.id" :value="l.id">{{ l.flag }}  {{ listName(l.id) }}</option>
    </select>
    <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  </div>
</template>

<style scoped>
.ls { position: relative; }
select {
  -webkit-appearance: none; appearance: none;
  width: 100%; min-height: 52px; padding: 0 44px 0 14px;
  border-radius: 14px; border: 2px solid var(--line);
  background: var(--bg2); color: var(--ink);
  font: 700 17px Manrope, sans-serif; cursor: pointer;
}
select:focus-visible { outline: none; border-color: var(--gold); }
option { background: var(--bg2); color: var(--ink); }
.chevron {
  position: absolute; right: 14px; top: 50%; width: 20px; height: 20px; transform: translateY(-50%);
  fill: none; stroke: var(--gold); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
  pointer-events: none;
}
</style>
