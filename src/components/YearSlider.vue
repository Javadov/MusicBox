<script setup lang="ts">
import { computed } from 'vue'
import { MIN_YEAR, MAX_YEAR } from '../lib/songs'

const model = defineModel<number>({ required: true })
defineProps<{ disabled?: boolean }>()
const decades = computed(() => {
  const out: number[] = []
  for (let y = Math.ceil(MIN_YEAR / 10) * 10; y <= MAX_YEAR; y += 10) out.push(y)
  return out
})
const pct = computed(() => ((model.value - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100)
const step = (d: number) => (model.value = Math.min(MAX_YEAR, Math.max(MIN_YEAR, model.value + d)))
</script>

<template>
  <div class="ys" :class="{ disabled }">
    <div class="top">
      <button class="nudge" :disabled="disabled" aria-label="Ett år tidigare" @click="step(-1)">−</button>
      <output class="big-year" aria-live="polite">{{ model }}</output>
      <button class="nudge" :disabled="disabled" aria-label="Ett år senare" @click="step(1)">+</button>
    </div>
    <input
      id="year-range" v-model.number="model" type="range" :min="MIN_YEAR" :max="MAX_YEAR" step="1"
      :disabled="disabled" :style="{ '--p': pct + '%' }" aria-label="Välj år"
    />
    <div class="ticks">
      <span v-for="d in decades" :key="d" :style="{ left: ((d - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100 + '%' }">
        {{ String(d).slice(2) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.ys { display: flex; flex-direction: column; gap: 10px; }
.ys.disabled { opacity: .55; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 8px; container-type: inline-size; }
/* Årtalet ska alltid rymmas mellan knapparna: skala efter radens bredd (4 siffror ≈ 3,3 em i Unbounded + luft) */
.top .big-year {
  flex: 1; min-width: 0; text-align: center; white-space: nowrap;
  font-size: 44px;
  font-size: clamp(32px, calc((100cqw - 2 * 48px - 2 * 8px) / 3.8), 72px);
}
.nudge {
  width: 48px; height: 48px; border-radius: 50%; border: 0; flex: none;
  background: var(--bg2); color: var(--ink); font: 800 28px/1 Manrope; cursor: pointer;
}
.nudge:active { background: var(--card); }
input[type=range] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 44px; background: transparent; margin: 0;
}
input[type=range]::-webkit-slider-runnable-track {
  height: 14px; border-radius: 999px;
  background: linear-gradient(90deg, var(--gold) var(--p), rgba(255,255,255,.14) var(--p));
}
input[type=range]::-moz-range-track { height: 14px; border-radius: 999px; background: rgba(255,255,255,.14); }
input[type=range]::-moz-range-progress { height: 14px; border-radius: 999px; background: var(--gold); }
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 40px; height: 40px; margin-top: -13px; border-radius: 50%;
  background: #fff; border: 6px solid var(--pink); box-shadow: 0 4px 12px rgba(0,0,0,.4);
}
input[type=range]::-moz-range-thumb {
  width: 30px; height: 30px; border-radius: 50%; background: #fff; border: 6px solid var(--pink);
}
.ticks { position: relative; height: 18px; margin: -6px 20px 0; font-size: 13px; color: var(--muted); }
.ticks span { position: absolute; transform: translateX(-50%); }
</style>
