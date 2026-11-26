import { describe, it, expect } from 'vitest'
import { points, rank, drawSongs, accuracyPoints, speedBonus, speedFactor, verdict, yearDiff } from '../src/lib/game'
import { pickBest } from '../src/lib/itunes'
import { SONGS, MIN_YEAR, MAX_YEAR } from '../src/lib/songs'

describe('poäng', () => {
  it('ger 100 p för rätt år och 10 p mindre per år fel', () => {
    expect(accuracyPoints(2015, 2015)).toBe(100)
    expect(accuracyPoints(2013, 2015)).toBe(80)
    expect(accuracyPoints(2020, 2015)).toBe(50)
    expect(accuracyPoints(1990, 2015)).toBe(0)
    expect(accuracyPoints(null, 2015)).toBe(0)
    expect(points(2013, 2015)).toBe(80) // utan tid: ingen bonus
  })
  it('ger snabbhetsbonus som skalas med träffsäkerheten', () => {
    expect(speedFactor(0, 30000)).toBe(1)
    expect(speedFactor(15000, 30000)).toBe(0.5)
    expect(speedFactor(40000, 30000)).toBe(0)
    expect(points(2015, 2015, 1)).toBe(150) // exakt + direkt
    expect(points(2015, 2015, 0.5)).toBe(125)
    expect(points(2010, 2015, 1)).toBe(75) // 50 + halv bonus
    expect(speedBonus(1980, 2015, 1)).toBe(0) // snabb men vild gissning
    expect(points(null, 2015, 1)).toBe(0)
  })
  it('bedömer gissningen efter år fel', () => {
    expect(yearDiff(2013, 2015)).toBe(2)
    expect(verdict(0)).toBe('Exakt rätt!')
    expect(verdict(null)).toBe('Missade')
  })
  it('rankar flest poäng först med delad plats', () => {
    const r = rank([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], { a: 10, b: 30, c: 30 })
    expect(r.map((x) => [x.id, x.place])).toEqual([['b', 1], ['c', 1], ['a', 3]])
  })
})

describe('låtlista', () => {
  it('har giltiga år och inga dubbletter', () => {
    const keys = new Set(SONGS.map((s) => `${s.a}|${s.t}`.toLowerCase()))
    expect(keys.size).toBe(SONGS.length)
    for (const s of SONGS) expect(s.y >= MIN_YEAR && s.y <= MAX_YEAR).toBe(true)
    expect(SONGS.length).toBeGreaterThanOrEqual(100)
  })
  it('drar reservlåtar', () => {
    expect(drawSongs(10).length).toBe(25)
    expect(drawSongs(100).length).toBe(Math.min(SONGS.length, 115))
  })
})

describe('iTunes-matchning', () => {
  const r = (artistName: string, trackName: string) => ({ artistName, trackName, previewUrl: 'x' + trackName })
  it('väljer originalet framför karaoke och live', () => {
    const best = pickBest({ a: 'Bon Jovi', t: "Livin' on a Prayer", y: 1986 }, [
      r('Karaoke Stars', "Livin' on a Prayer (Karaoke Version)"),
      r('Bon Jovi', "Livin' On a Prayer (Live)"),
      r('Bon Jovi', "Livin' On a Prayer"),
    ])
    expect(best?.trackName).toBe("Livin' On a Prayer")
  })
  it('hanterar parenteser och feat', () => {
    const best = pickBest({ a: 'Mark Ronson', t: 'Uptown Funk', y: 2014 }, [r('Mark Ronson', 'Uptown Funk (feat. Bruno Mars)')])
    expect(best).toBeTruthy()
    const sat = pickBest({ a: 'The Rolling Stones', t: "(I Can't Get No) Satisfaction", y: 1965 }, [r('The Rolling Stones', "(I Can't Get No) Satisfaction (Mono)")])
    expect(sat).toBeTruthy()
  })
})
