import { describe, it, expect } from 'vitest'
import { points, rank, drawSongs, accuracyPoints, speedBonus, speedFactor, verdict, yearDiff } from '../src/lib/game'
import { pickBest } from '../src/lib/itunes'
import { LISTS, MIN_YEAR, MAX_YEAR, loadSongs } from '../src/lib/songs'
import { correctedYear, earliestYear } from '../src/lib/itunes'

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
    expect(verdict(0)).toBe('verdict.exact')
    expect(verdict(null)).toBe('verdict.missed')
  })
  it('rankar flest poäng först med delad plats', () => {
    const r = rank([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], { a: 10, b: 30, c: 30 })
    expect(r.map((x) => [x.id, x.place])).toEqual([['b', 1], ['c', 1], ['a', 3]])
  })
})

describe('låtlistor', () => {
  for (const list of LISTS) {
    it(`${list.label}: giltiga år och inga dubbletter`, async () => {
      const songs = await loadSongs(list.id)
      expect(songs.length).toBeGreaterThanOrEqual(50)
      const keys = new Set(songs.map((s) => `${s.a}|${s.t}`.toLowerCase()))
      expect(keys.size).toBe(songs.length)
      for (const s of songs) {
        expect(s.a && s.t).toBeTruthy()
        expect(s.y >= MIN_YEAR && s.y <= MAX_YEAR).toBe(true)
      }
    })
  }
  it('engelska är internationella utan icke-engelska låtar', async () => {
    const [intl, en] = await Promise.all([loadSongs('international'), loadSongs('english')])
    expect(en.length).toBeLessThan(intl.length)
    expect(en.every((s) => !s.l)).toBe(true)
  })
  it('drar reservlåtar', async () => {
    const songs = await loadSongs('international')
    expect(drawSongs(songs, 10).length).toBe(35)
    const small = songs.slice(0, 20)
    expect(drawSongs(small, 100).length).toBe(20)
  })
})

describe('osäkra år', () => {
  const r = (artistName: string, trackName: string, releaseDate: string) => ({ artistName, trackName, previewUrl: 'x', releaseDate })
  it('rättar ett osäkert år när iTunes har en tidigare utgåva av samma låt', () => {
    const song = { a: 'Röya', t: 'Ağla', y: 2004, u: true }
    const results = [r('Röya', 'Ağla', '2001-05-01T07:00:00Z'), r('Röya', 'Ağla (Remix)', '2010-01-01T07:00:00Z'), r('Röya', 'Annan låt', '1995-01-01T07:00:00Z')]
    const year = earliestYear(song, results)
    expect(year).toBe(2001) // "Annan låt" räknas inte
    expect(correctedYear(song, { previewUrl: 'x', year })).toBe(2001)
  })
  it('rör inte säkra år eller senare iTunes-år', () => {
    expect(correctedYear({ a: 'A', t: 'B', y: 1990 }, { previewUrl: 'x', year: 1985 })).toBe(1990)
    expect(correctedYear({ a: 'A', t: 'B', y: 1990, u: true }, { previewUrl: 'x', year: 2005 })).toBe(1990)
  })
  it('matchar turkiska och azerbajdzjanska bokstäver', () => {
    const results = [r('Sezen Aksu', 'Kaç Yıl Geçti Aradan', '1977-01-01T08:00:00Z')]
    expect(earliestYear({ a: 'Sezen Aksu', t: 'Kaç Yıl Geçti Aradan', y: 1980, u: true }, results)).toBe(1977)
    expect(earliestYear({ a: 'Zülfiyyə Xanbabayeva', t: 'Sənsiz', y: 2003 }, [r('Zulfiyye Xanbabayeva', 'Sensiz', '2003-01-01T08:00:00Z')])).toBe(2003)
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
  it('väljer aldrig en annan låt av samma artist', () => {
    expect(pickBest({ a: 'Nilüfer', t: 'Göreceksin Kendini', y: 1979 }, [r('Nilüfer', 'Haram Geceler')])).toBeUndefined()
  })
  it('hanterar parenteser och feat', () => {
    const best = pickBest({ a: 'Mark Ronson', t: 'Uptown Funk', y: 2014 }, [r('Mark Ronson', 'Uptown Funk (feat. Bruno Mars)')])
    expect(best).toBeTruthy()
    const sat = pickBest({ a: 'The Rolling Stones', t: "(I Can't Get No) Satisfaction", y: 1965 }, [r('The Rolling Stones', "(I Can't Get No) Satisfaction (Mono)")])
    expect(sat).toBeTruthy()
  })
})
