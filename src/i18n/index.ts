import { ref, watch } from 'vue'
import sv, { type MessageKey, type Messages } from './sv'
import en from './en'
import tr from './tr'
import az from './az'

export type { MessageKey }
export type Lang = 'en' | 'sv' | 'az' | 'tr'

/** Språk i väljaren, med namnet på språket självt. */
export const LANGUAGES: { id: Lang; label: string; flag: string }[] = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { id: 'az', label: 'Azərbaycanca', flag: '🇦🇿' },
  { id: 'tr', label: 'Türkçe', flag: '🇹🇷' },
]
const DICTS: Record<Lang, Messages> = { en, sv, az, tr }
export const FALLBACK: Lang = 'en'

/** Land (ISO-kod) → språk. Alla andra länder får engelska. */
export const COUNTRY_LANG: Record<string, Lang> = { SE: 'sv', AZ: 'az', TR: 'tr' }

const SAVED_KEY = 'ag-lang' // språk som spelaren själv valt
const GEO_KEY = 'ag-geo-lang' // språk från IP-platsen (förra besöket)

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* privat läge e.d. */
    }
  },
}
const isLang = (v: unknown): v is Lang => typeof v === 'string' && v in DICTS

/** Webbläsarens språk – bara som snabb gissning tills IP-platsen svarat. */
function browserLang(): Lang | null {
  if (typeof navigator === 'undefined') return null
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l?.slice(0, 2).toLowerCase()
    if (isLang(code)) return code
  }
  return null
}

function initial(): Lang {
  const saved = store.get(SAVED_KEY)
  if (isLang(saved)) return saved
  const geo = store.get(GEO_KEY)
  if (isLang(geo)) return geo
  return browserLang() ?? FALLBACK
}

export const locale = ref<Lang>(initial())

/** Översätt en nyckel. {namn} byts mot värden i `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = DICTS[locale.value][key] ?? sv[key] ?? key
  return params ? text.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m)) : text
}

/** Namnet på en låtlista på valt språk. */
export const listName = (id: string) => t(`list.${id}` as MessageKey)

/** Spelaren väljer själv – sparas och går före IP-platsen. */
export function setLocale(lang: Lang) {
  locale.value = lang
  store.set(SAVED_KEY, lang)
}

/**
 * Välj språk utifrån landet besökaren befinner sig i (Vercel vet det från IP-adressen).
 * Görs inte om spelaren själv har valt språk. Svaret sparas så nästa besök blir rätt direkt.
 */
export async function detectLocale(timeoutMs = 2500): Promise<void> {
  if (isLang(store.get(SAVED_KEY))) return
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch('/api/geo', { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return // t.ex. lokalt utan /api
    const { country } = (await res.json()) as { country?: string | null }
    if (!country) return
    const lang = COUNTRY_LANG[country.toUpperCase()] ?? FALLBACK
    store.set(GEO_KEY, lang)
    if (!isLang(store.get(SAVED_KEY))) locale.value = lang // spelaren kan ha valt under tiden
  } catch {
    /* behåll nuvarande språk */
  }
}

// Sidans språk och titel följer valt språk
if (typeof document !== 'undefined') {
  watch(
    locale,
    () => {
      document.documentElement.lang = locale.value
      document.title = t('app.title')
    },
    { immediate: true },
  )
}
