<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { detectLocale, t } from './i18n'
import Home from './views/Home.vue'
import LocalGame from './views/LocalGame.vue'
import OnlineGame from './views/OnlineGame.vue'
import type { Session } from './lib/session'

type View = 'home' | 'local' | 'host' | 'join'

// Språk utifrån landet besökaren är i (om spelaren inte själv valt språk)
detectLocale()
const view = ref<View>('home')
/** pågående spel att gå tillbaka till (från kortet på startsidan) */
const resume = ref<Session | null>(null)
function go(v: View, s: Session | null = null) {
  resume.value = s
  view.value = v
}

// ---------- Nya versioner ----------
// Appen sparas i webbläsaren (PWA). Leta efter en ny version när appen öppnas,
// när man kommer tillbaka till den och en gång i timmen.
const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => reg.update().catch(() => {})
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})
// På startsidan byts versionen direkt – under ett spel väntar vi (notisen nedan)
watch(
  [needRefresh, view],
  ([ready, v]) => {
    if (ready && v === 'home') updateServiceWorker(true)
  },
  { immediate: true },
)
</script>

<template>
  <Home v-if="view === 'home'" @go="go($event)" @resume="go($event.host ? 'host' : 'join', $event)" />
  <LocalGame v-else-if="view === 'local'" @exit="go('home')" />
  <OnlineGame v-else :key="view" :mode="view" :resume="resume" @exit="go('home')" />

  <div v-if="needRefresh && view !== 'home'" class="update" role="status">
    <span>{{ t('update.available') }}</span>
    <button class="update-btn" @click="updateServiceWorker(true)">{{ t('update.button') }}</button>
  </div>
</template>

<style scoped>
.update {
  position: fixed; left: 50%; top: calc(10px + env(safe-area-inset-top)); transform: translateX(-50%);
  z-index: 20; display: flex; align-items: center; gap: 12px; max-width: calc(100% - 32px);
  padding: 8px 8px 8px 16px; border-radius: 999px; white-space: nowrap;
  background: rgba(20, 10, 45, .94); color: var(--ink); font-size: 14px; box-shadow: 0 6px 20px rgba(0,0,0,.4);
}
.update-btn {
  border: 0; border-radius: 999px; padding: 6px 12px; cursor: pointer;
  background: var(--gold); color: #1b0f3b; font: 800 13px Manrope, sans-serif;
}
</style>
