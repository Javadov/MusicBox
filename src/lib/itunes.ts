import { MIN_YEAR, type Song } from './songs'

export interface Clip {
  previewUrl: string
  artwork?: string
  /** tidigaste utgivningsår i iTunes för just den här låten (samma artist + titel) */
  year?: number
}

const cache = new Map<string, Clip | null>()

// Bokstäver som inte delas upp av NFD (turkiska ı, azerbajdzjanska ə m.fl.)
const SPECIAL: Record<string, string> = { ı: 'i', ə: 'e', ø: 'o', æ: 'ae', ß: 'ss', đ: 'd', ł: 'l', œ: 'oe' }

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ıəøæßđłœ]/g, (c) => SPECIAL[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

interface ItunesResult {
  artistName: string
  trackName: string
  previewUrl?: string
  artworkUrl100?: string
  releaseDate?: string
}

// JSONP: iTunes Search API stöder ?callback=, så vi slipper CORS-problem.
let jsonpId = 0
function jsonp<T>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__itunes_cb_${Date.now()}_${jsonpId++}`
    const script = document.createElement('script')
    const w = window as unknown as Record<string, unknown>
    const cleanup = () => {
      delete w[name]
      script.remove()
      clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('iTunes timeout'))
    }, timeoutMs)
    w[name] = (data: T) => {
      cleanup()
      resolve(data)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('iTunes network error'))
    }
    script.src = `${url}&callback=${name}`
    document.head.appendChild(script)
  })
}

function matchers(song: Song) {
  const artist = norm(song.a)
  const title = norm(song.t)
  const artistOk = (r: ItunesResult) => {
    const ra = norm(r.artistName)
    return !!ra && (ra.includes(artist) || artist.includes(ra))
  }
  const titleOk = (r: ItunesResult) => {
    const rt = norm(r.trackName)
    return !!rt && (rt === title || rt.startsWith(title) || title.startsWith(rt))
  }
  return { artistOk, titleOk }
}

/** Tidigaste utgivningsår bland iTunes-träffar som är samma låt (artist + titel). */
export function earliestYear(song: Song, results: ItunesResult[]): number | undefined {
  const { artistOk, titleOk } = matchers(song)
  const years = results
    .filter((r) => artistOk(r) && titleOk(r) && r.releaseDate)
    .map((r) => new Date(r.releaseDate!).getUTCFullYear())
    .filter((y) => y >= MIN_YEAR)
  return years.length ? Math.min(...years) : undefined
}

/**
 * Året som ska gälla för låten. Osäkra år (`u`) rättas om iTunes har en tidigare
 * utgåva av samma låt – en låt kan inte ha getts ut innan den släpptes.
 */
export function correctedYear(song: Song, clip?: Clip | null): number {
  return song.u && clip?.year && clip.year < song.y ? clip.year : song.y
}

export function pickBest(song: Song, results: ItunesResult[]): ItunesResult | undefined {
  const { artistOk, titleOk } = matchers(song)
  const withPreview = results.filter((r) => r.previewUrl)
  const bad = /\b(karaoke|instrumental|cover|tribute|remix|live|acoustic|made famous)\b/i
  const clean = (r: ItunesResult) => !bad.test(r.trackName) || bad.test(song.t)
  // Bara samma låt räknas – en annan låt av samma artist skulle ge fel facit (titel och år).
  // Saknas låten hoppar spelet till nästa i listan.
  return (
    withPreview.find((r) => artistOk(r) && titleOk(r) && clean(r)) ??
    withPreview.find((r) => artistOk(r) && titleOk(r))
  )
}

type SearchResponse = { results: ItunesResult[] }

/**
 * Sök via vår egen /api/itunes (Vercel-funktion, eller Vite-proxy lokalt).
 * Faller tillbaka på JSONP direkt mot iTunes om /api saknas – fungerar på dator men inte på iPhone.
 */
async function search(term: string, country: string): Promise<SearchResponse> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`/api/itunes?term=${encodeURIComponent(term)}&country=${country}`, { signal: ctrl.signal })
    clearTimeout(t)
    // iTunes svarar med text/javascript även för ren JSON (lokalt via Vite-proxyn), så tolka texten själv
    if (res.ok) {
      const data = JSON.parse(await res.text()) as SearchResponse
      if (Array.isArray(data?.results)) return data
    }
  } catch {
    /* prova JSONP */
  }
  return jsonp<SearchResponse>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=15&country=${country}`,
  )
}

export async function findClip(song: Song, countries: string[] = ['SE', 'US']): Promise<Clip | null> {
  const key = `${song.a}|${song.t}`
  if (cache.has(key)) return cache.get(key)!
  const term = `${song.a} ${song.t}`
  let clip: Clip | null = null
  for (const country of countries) {
    try {
      const data = await search(term, country)
      const best = pickBest(song, data.results ?? [])
      if (best?.previewUrl) {
        clip = {
          previewUrl: best.previewUrl,
          artwork: best.artworkUrl100?.replace('100x100', '400x400'),
          year: earliestYear(song, data.results ?? []),
        }
        break
      }
    } catch {
      /* prova nästa land */
    }
  }
  cache.set(key, clip)
  return clip
}
