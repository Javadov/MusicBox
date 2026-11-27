<script setup lang="ts">
import { LANGUAGES, locale, setLocale, t, type Lang } from '../i18n'

function onChange(e: Event) {
  setLocale((e.target as HTMLSelectElement).value as Lang)
}
</script>

<template>
  <label class="lang">
    <span class="sr-only">{{ t('home.language') }}</span>
    <select id="lang" :value="locale" @change="onChange">
      <option v-for="l in LANGUAGES" :key="l.id" :value="l.id">{{ l.flag }}  {{ l.label }}</option>
    </select>
    <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  </label>
</template>

<style scoped>
.lang { position: relative; display: inline-block; }
select {
  -webkit-appearance: none; appearance: none; cursor: pointer;
  min-height: 40px; padding: 0 34px 0 12px; border-radius: 999px;
  border: 2px solid var(--line); background: var(--bg2); color: var(--ink);
  font: 700 15px Manrope, sans-serif;
}
select:focus-visible { outline: none; border-color: var(--gold); }
option { background: var(--bg2); color: var(--ink); }
.chevron {
  position: absolute; right: 10px; top: 50%; width: 16px; height: 16px; transform: translateY(-50%);
  fill: none; stroke: var(--gold); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; pointer-events: none;
}
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
