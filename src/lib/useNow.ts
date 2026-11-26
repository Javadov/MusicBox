import { onBeforeUnmount, ref } from 'vue'

/** Reaktiv klocka för nedräkningar och progressring. */
export function useNow(intervalMs = 100) {
  const now = ref(Date.now())
  const t = setInterval(() => (now.value = Date.now()), intervalMs)
  onBeforeUnmount(() => clearInterval(t))
  return now
}
