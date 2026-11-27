import type { Song } from './songs'
import type { MessageKey } from '../i18n'

/**
 * Poäng: mest poäng vinner.
 * - Träffsäkerhet: 100 p för exakt rätt år, 10 p mindre per år fel (0 p vid 10+ år fel).
 * - Snabbhetsbonus (online): upp till +50 p. Skalas med träffsäkerheten,
 *   så en snabb men vild gissning ger nästan ingen bonus.
 */
export const MAX_POINTS = 100
export const POINTS_PER_YEAR = 10
export const SPEED_BONUS = 50

export function yearDiff(guess: number | null | undefined, year: number): number | null {
  return guess == null ? null : Math.abs(Math.round(guess) - year)
}

export function accuracyPoints(guess: number | null | undefined, year: number): number {
  const d = yearDiff(guess, year)
  return d == null ? 0 : Math.max(0, MAX_POINTS - d * POINTS_PER_YEAR)
}

/** 1 = svarade direkt, 0 = svarade i sista stund. */
export function speedFactor(elapsedMs: number, windowMs: number): number {
  if (windowMs <= 0) return 0
  return 1 - Math.min(1, Math.max(0, elapsedMs / windowMs))
}

export function speedBonus(guess: number | null | undefined, year: number, speed?: number | null): number {
  if (speed == null) return 0
  return Math.round((SPEED_BONUS * accuracyPoints(guess, year) * Math.min(1, Math.max(0, speed))) / MAX_POINTS)
}

/** Totala poäng för en gissning. `speed` (0–1) utelämnas där snabbhet inte räknas. */
export function points(guess: number | null | undefined, year: number, speed?: number | null): number {
  return accuracyPoints(guess, year) + speedBonus(guess, year, speed)
}

export function shuffle<T>(arr: T[], rnd = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Blandar låtlistan. Extra låtar tas med som reserv om ett ljudklipp saknas
 * (vanligare i mindre listor, där fler låtar saknas i iTunes).
 */
export function drawSongs(songs: Song[], count: number, rnd = Math.random): Song[] {
  return shuffle(songs, rnd).slice(0, Math.min(songs.length, count * 2 + 15))
}

export interface Ranked {
  id: string
  name: string
  total: number
  place: number
}

/** Sorterar fallande (flest poäng först). Lika poäng delar placering. */
export function rank(players: { id: string; name: string }[], totals: Record<string, number>): Ranked[] {
  const sorted = players
    .map((p) => ({ ...p, total: totals[p.id] ?? 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'sv'))
  let place = 0
  let prev = -1
  return sorted.map((p, i) => {
    if (p.total !== prev) {
      place = i + 1
      prev = p.total
    }
    return { ...p, place }
  })
}

/** Bedömning av en gissning, som översättningsnyckel (visa med t()). */
export function verdict(diff: number | null): MessageKey {
  if (diff == null) return 'verdict.missed'
  if (diff === 0) return 'verdict.exact'
  if (diff <= 2) return 'verdict.superClose'
  if (diff <= 5) return 'verdict.close'
  if (diff < 10) return 'verdict.ok' // 10+ år fel ger 0 p
  return 'verdict.far'
}
