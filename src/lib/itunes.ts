import type { Song } from './songs'

export interface Clip {
  previewUrl: string
  artwork?: string
}

const cache = new Map<string, Clip | null>()

const norm = (s: string) =>
  s
    .toLowerCase()
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

export function pickBest(song: Song, results: ItunesResult[]): ItunesResult | undefined {
  const artist = norm(song.a)
  const title = norm(song.t)
  const withPreview = results.filter((r) => r.previewUrl)
  const artistOk = (r: ItunesResult) => {
    const ra = norm(r.artistName)
    return ra.includes(artist) || artist.includes(ra)
  }
  const titleOk = (r: ItunesResult) => {
    const rt = norm(r.trackName)
    return rt === title || rt.startsWith(title) || title.startsWith(rt)
  }
  const bad = /\b(karaoke|instrumental|cover|tribute|remix|live|acoustic|made famous)\b/i
  const clean = (r: ItunesResult) => !bad.test(r.trackName) || bad.test(song.t)
  return (
    withPreview.find((r) => artistOk(r) && titleOk(r) && clean(r)) ??
    withPreview.find((r) => artistOk(r) && titleOk(r)) ??
    withPreview.find((r) => artistOk(r) && clean(r))
  )
}

export async function findClip(song: Song): Promise<Clip | null> {
  const key = `${song.a}|${song.t}`
  if (cache.has(key)) return cache.get(key)!
  const term = encodeURIComponent(`${song.a} ${song.t}`)
  let clip: Clip | null = null
  for (const country of ['SE', 'US']) {
    try {
      const data = await jsonp<{ results: ItunesResult[] }>(
        `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=15&country=${country}`,
      )
      const best = pickBest(song, data.results ?? [])
      if (best?.previewUrl) {
        clip = {
          previewUrl: best.previewUrl,
          artwork: best.artworkUrl100?.replace('100x100', '400x400'),
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
