<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ playing?: boolean; progress?: number; artwork?: string; label?: string }>()
const R = 118
const C = 2 * Math.PI * R
const dash = computed(() => C * (1 - Math.min(1, Math.max(0, props.progress ?? 0))))
</script>

<template>
  <div class="vinyl" :class="{ playing }">
    <svg viewBox="0 0 260 260" aria-hidden="true">
      <defs>
        <radialGradient id="disc" cx="50%" cy="45%" r="60%">
          <stop offset="0" stop-color="#2b2340" />
          <stop offset="1" stop-color="#0b0814" />
        </radialGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".22" />
          <stop offset=".45" stop-color="#fff" stop-opacity="0" />
          <stop offset=".55" stop-color="#fff" stop-opacity="0" />
          <stop offset="1" stop-color="#fff" stop-opacity=".14" />
        </linearGradient>
        <clipPath id="lbl"><circle cx="130" cy="130" r="44" /></clipPath>
      </defs>
      <ellipse cx="130" cy="246" rx="84" ry="8" fill="#000" opacity=".35" />
      <circle cx="130" cy="130" :r="R" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8" />
      <circle
        cx="130" cy="130" :r="R" fill="none" stroke="#ffd23f" stroke-width="8" stroke-linecap="round"
        :stroke-dasharray="C" :stroke-dashoffset="dash" transform="rotate(-90 130 130)" class="ring"
      />
      <g class="spin">
        <circle cx="130" cy="130" r="106" fill="url(#disc)" />
        <circle v-for="r in [96, 88, 80, 72, 64, 56]" :key="r" cx="130" cy="130" :r="r" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="1" />
        <circle cx="130" cy="130" r="106" fill="url(#shine)" />
        <circle cx="130" cy="130" r="44" fill="#ff4f8b" />
        <image v-if="artwork" :href="artwork" x="86" y="86" width="88" height="88" clip-path="url(#lbl)" preserveAspectRatio="xMidYMid slice" />
        <circle v-else cx="130" cy="130" r="34" fill="none" stroke="#ffd23f" stroke-width="2" opacity=".7" />
        <circle cx="130" cy="130" r="5" fill="#1b0f3b" />
      </g>
    </svg>
    <div v-if="label" class="label">{{ label }}</div>
  </div>
</template>

<style scoped>
.vinyl { position: relative; width: min(68vw, 260px); aspect-ratio: 1; margin: 0 auto; }
svg { width: 100%; height: 100%; display: block; overflow: visible; }
.spin { transform-origin: 130px 130px; animation: spin 1.8s linear infinite; animation-play-state: paused; }
.playing .spin { animation-play-state: running; }
.ring { transition: stroke-dashoffset .12s linear; }
.label {
  position: absolute; inset: 0; display: grid; place-items: center;
  font: 800 44px/1 Unbounded, sans-serif; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.5); pointer-events: none;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
