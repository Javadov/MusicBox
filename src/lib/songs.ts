// Låtlistor ligger som JSON i src/songs/. Året är originalsläppet (singel/album), INTE remaster/samling.
// Ljudet hämtas via iTunes Search API vid speltillfället.
export interface Song {
  a: string // artist
  t: string // titel
  y: number // år
  /** osäkert år – kontrolleras mot iTunes när låten spelas */
  u?: boolean
  /** språk för icke-engelska låtar i international.json (sv, es, fr, …) */
  l?: string
}

export const MIN_YEAR = 1960
export const MAX_YEAR = 2025

export type ListId = 'international' | 'english' | 'svenska' | 'turkce' | 'azerbaycanca'

export interface SongList {
  id: ListId
  label: string
  flag: string
  /** iTunes-butiker att söka i, i tur och ordning */
  countries: string[]
}

export const LISTS: SongList[] = [
  { id: 'international', label: 'Internationell', flag: '🌍', countries: ['SE', 'US'] },
  { id: 'english', label: 'Engelska', flag: '🇬🇧', countries: ['SE', 'US'] },
  { id: 'svenska', label: 'Svenska', flag: '🇸🇪', countries: ['SE', 'US'] },
  { id: 'turkce', label: 'Türkçe', flag: '🇹🇷', countries: ['TR', 'SE', 'US'] },
  { id: 'azerbaycanca', label: 'Azərbaycanca', flag: '🇦🇿', countries: ['AZ', 'TR', 'SE', 'US'] },
]
export const DEFAULT_LIST: ListId = 'international'

export const getList = (id?: string): SongList => LISTS.find((l) => l.id === id) ?? LISTS[0]

// Laddas först när listan behövs, så startsidan förblir snabb
const files = import.meta.glob<Song[]>('../songs/*.json', { import: 'default' })

const loaded = new Map<ListId, Promise<Song[]>>()

/** Laddar en låtlista (en gång – sedan återanvänds den). */
export function loadSongs(id: ListId): Promise<Song[]> {
  let p = loaded.get(id)
  if (!p) {
    p = loadList(id)
    p.catch(() => loaded.delete(id)) // försök igen nästa gång om det misslyckades
    loaded.set(id, p)
  }
  return p
}

async function loadList(id: ListId): Promise<Song[]> {
  if (id === 'english') return (await loadSongs('international')).filter((s) => !s.l)
  const load = files[`../songs/${id}.json`]
  if (!load) throw new Error(`Okänd låtlista: ${id}`)
  return (await load()).filter((s) => s.y >= MIN_YEAR && s.y <= MAX_YEAR)
}
