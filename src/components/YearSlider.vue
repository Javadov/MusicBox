<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { MIN_YEAR, MAX_YEAR } from '../lib/songs'

const model = defineModel<number>({ required: true })
const props = defineProps<{ disabled?: boolean }>()
/** Skickas när spelaren själv rör hjulet eller −/+ (inte när värdet ändras från koden). */
const emit = defineEmits<{ interact: [] }>()

/** px per år på hjulet */
const STEP = 14
const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i)
const wheel = ref<HTMLElement | null>(null)
/** hjulets position i år (flyttal) – styr streckens storlek medan man drar */
const pos = ref(model.value - MIN_YEAR)

const clamp = (y: number) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y))

function interact() {
  if (!props.disabled) emit('interact')
}

function step(d: number) {
  interact()
  model.value = clamp(model.value + d)
}

let raf = 0
function onScroll() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const el = wheel.value
    if (!el) return
    pos.value = el.scrollLeft / STEP
    const y = clamp(MIN_YEAR + Math.round(pos.value))
    if (y !== model.value) {
      model.value = y
      if (userScrolling) navigator.vibrate?.(4) // liten "klick"-känsla på Android
    }
  })
}

// Skilj på spelarens scroll och vår egen scrollTo
let userScrolling = false
function startUser() {
  userScrolling = true
  interact()
}
function endUser() {
  userScrolling = false
}

function scrollToYear(y: number, smooth: boolean) {
  const el = wheel.value
  if (!el) return
  el.scrollTo({ left: (y - MIN_YEAR) * STEP, behavior: smooth ? 'smooth' : 'auto' })
}

watch(model, (y) => {
  if (MIN_YEAR + Math.round(pos.value) !== y) scrollToYear(y, Math.abs(MIN_YEAR + pos.value - y) <= 25)
})

// ---------- Dator: mus och scrollhjul ----------
// Touch sköts av webbläsarens egen scroll. En mus kan inte dra ett scrollfält,
// så där flyttar vi hjulet själva.
const dragging = ref(false)
let dragX = 0
let dragStartLeft = 0
let dragMoved = 0

function onPointerDown(e: PointerEvent) {
  startUser()
  if (e.pointerType !== 'mouse' || e.button !== 0 || !wheel.value) return
  e.preventDefault()
  dragging.value = true
  dragX = e.clientX
  dragStartLeft = wheel.value.scrollLeft
  dragMoved = 0
  wheel.value.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || !wheel.value) return
  const dx = e.clientX - dragX
  dragMoved = Math.max(dragMoved, Math.abs(dx))
  wheel.value.scrollLeft = dragStartLeft - dx
}

function onPointerUp(e: PointerEvent) {
  endUser()
  const el = wheel.value
  if (!dragging.value || !el) return
  if (dragMoved < 4) {
    // Ett klick: hoppa till året man klickade på
    dragging.value = false
    const r = el.getBoundingClientRect()
    model.value = clamp(centerYear.value + Math.round((e.clientX - (r.left + r.width / 2)) / STEP))
    return
  }
  // Ställ hjulet exakt på närmaste år INNAN snäppningen slås på igen –
  // annars snäpper Safari tillbaka till året man började dra från.
  const y = clamp(MIN_YEAR + Math.round(el.scrollLeft / STEP))
  el.scrollLeft = (y - MIN_YEAR) * STEP
  pos.value = y - MIN_YEAR
  model.value = y
  requestAnimationFrame(() => (dragging.value = false))
}

// Vanligt scrollhjul (upp/ner) stegar år. Sidledes scroll från styrplatta får webbläsaren sköta.
let wheelAcc = 0
function onWheel(e: WheelEvent) {
  interact()
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  e.preventDefault()
  wheelAcc += e.deltaY * (e.deltaMode === 1 ? 16 : 1)
  const steps = Math.trunc(wheelAcc / 40)
  if (steps) {
    wheelAcc -= steps * 40
    model.value = clamp(model.value + steps)
  }
}

onMounted(async () => {
  await nextTick()
  scrollToYear(model.value, false)
  pos.value = model.value - MIN_YEAR
})

function onKey(e: KeyboardEvent) {
  const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key]
  if (d) {
    e.preventDefault()
    step(d)
  }
}

function tickStyle(i: number) {
  const d = Math.abs(i - pos.value)
  const grow = Math.max(0, 1 - d / 2.5) // 1 i mitten, 0 en bit bort
  return { height: `${(years[i] % 10 === 0 ? 30 : 22) + grow * 26}px` }
}

const centerYear = computed(() => MIN_YEAR + Math.round(pos.value))
</script>

<template>
  <div class="ys" :class="{ disabled }">
    <div class="top">
      <button class="nudge" :disabled="disabled" aria-label="Ett år tidigare" @click="step(-1)">−</button>
      <output class="big-year" aria-live="polite">{{ model }}</output>
      <button class="nudge" :disabled="disabled" aria-label="Ett år senare" @click="step(1)">+</button>
    </div>

    <div class="wheel-wrap">
      <div
        id="year-wheel"
        ref="wheel"
        class="wheel"
        role="slider"
        tabindex="0"
        aria-label="Välj år"
        :aria-valuemin="MIN_YEAR"
        :aria-valuemax="MAX_YEAR"
        :aria-valuenow="model"
        @scroll.passive="onScroll"
        :class="{ dragging }"
        @touchstart.passive="startUser"
        @touchend.passive="endUser"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel="onWheel"
        @keydown="onKey"
      >
        <div class="track" :style="{ '--step': STEP + 'px' }">
          <span
            v-for="(y, i) in years"
            :key="y"
            class="tick"
            :class="{ past: y <= centerYear, decade: y % 10 === 0, center: y === centerYear }"
          >
            <i :style="tickStyle(i)" />
            <small v-if="y % 10 === 0">{{ String(y).slice(2) }}</small>
          </span>
        </div>
      </div>
      <div class="pointer" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.ys { display: flex; flex-direction: column; gap: 6px; }
.ys.disabled { opacity: .55; pointer-events: none; }
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

.wheel-wrap { position: relative; margin: 0 -8px 12px; }
.wheel {
  overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
  scroll-snap-type: x mandatory; overscroll-behavior-x: contain; touch-action: pan-x;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
  outline: none; cursor: grab;
}
.wheel::-webkit-scrollbar { display: none; }
.wheel.dragging { scroll-snap-type: none; cursor: grabbing; }
.wheel, .tick { user-select: none; -webkit-user-select: none; }
.wheel:focus-visible { box-shadow: inset 0 0 0 2px var(--gold); border-radius: 12px; }
/* Padding så att första och sista året kan hamna i mitten */
.track { display: flex; width: max-content; padding: 0 calc(50% - var(--step) / 2); }
.wheel .track { padding: 0 calc((100cqw - var(--step)) / 2); }
.wheel { container-type: inline-size; }
.tick {
  flex: none; width: var(--step); height: 86px; scroll-snap-align: center;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  position: relative;
}
.tick i {
  display: block; width: 4px; border-radius: 4px; background: rgba(255, 210, 63, .28);
  transition: height .08s linear, background-color .12s;
}
.tick.past i { background: var(--gold); }
.tick.center i { width: 6px; box-shadow: 0 0 12px rgba(255, 210, 63, .6); }
.tick small {
  position: absolute; bottom: 0; font-size: 11px; color: var(--muted); letter-spacing: .02em;
}
.pointer {
  position: absolute; left: 50%; bottom: -12px; transform: translateX(-50%);
  width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent;
  border-bottom: 11px solid var(--gold); filter: drop-shadow(0 2px 4px rgba(0,0,0,.4));
}
</style>
