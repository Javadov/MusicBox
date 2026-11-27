import { describe, it, expect, vi, afterEach } from 'vitest'
import sv from '../src/i18n/sv'
import en from '../src/i18n/en'
import tr from '../src/i18n/tr'
import az from '../src/i18n/az'
import { COUNTRY_LANG, detectLocale, locale, t } from '../src/i18n'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('översättningar', () => {
  for (const [name, dict] of Object.entries({ en, tr, az })) {
    it(`${name}: samma nycklar och {platshållare} som svenskan, inga tomma texter`, () => {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(sv).sort())
      for (const [key, text] of Object.entries(sv)) {
        const other = dict[key as keyof typeof dict]
        expect(other.trim(), key).not.toBe('')
        expect(placeholders(other), key).toEqual(placeholders(text))
      }
    })
  }
  it('fyller i värden', () => {
    locale.value = 'en'
    expect(t('common.songOf', { n: 3, total: 10 })).toBe('Song 3 of 10')
    locale.value = 'tr'
    expect(t('err.noRoom', { code: '1234' })).toBe('1234 kodlu oda bulunamadı.')
  })
})

describe('språk från IP-plats', () => {
  afterEach(() => vi.unstubAllGlobals())
  const geo = (country: string | null) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ country }), { headers: { 'content-type': 'application/json' } })))

  it('Sverige, Azerbajdzjan och Turkiet får sitt språk, andra länder engelska', async () => {
    expect(COUNTRY_LANG).toEqual({ SE: 'sv', AZ: 'az', TR: 'tr' })
    for (const [country, lang] of [['SE', 'sv'], ['AZ', 'az'], ['TR', 'tr'], ['DE', 'en'], ['US', 'en']] as const) {
      locale.value = 'sv'
      geo(country)
      await detectLocale()
      expect(locale.value, country).toBe(lang)
    }
  })
  it('behåller språket om landet är okänt eller anropet misslyckas', async () => {
    locale.value = 'az'
    geo(null)
    await detectLocale()
    expect(locale.value).toBe('az')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await detectLocale()
    expect(locale.value).toBe('az')
  })
})
