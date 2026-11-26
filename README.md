# Gissa året 🎵

Mobilspel (PWA): lyssna 10 sekunder på en låt och dra skalan till det år du tror att den kom ut.
Rätt år = 100 poäng, 10 poäng mindre per år fel. Online ger snabba svar upp till 50 bonuspoäng. **Flest poäng vinner.**

## Lägen
- **En mobil** – musiken går i mobilen/högtalaren, mobilen skickas runt och alla gissar i tur och ordning.
- **Online-rum** – värden skapar ett rum (4-siffrig kod), alla går med i sin egen mobil och gissar samtidigt.
  Värden väljer om ljudet ska spelas i **alla mobiler** eller **bara värdens** (högtalare).

## Kom igång
Kräver Node 20.19+ eller 22.12+ (Vite 8).

```bash
npm install
cp .env.example .env    # fyll i Supabase-nycklarna (behövs bara för onlineläget)
npm run dev             # startar på http://localhost:5173 och ditt lokala nät
```
Testa i mobilen: öppna adressen som visas under "Network" (t.ex. `http://192.168.1.20:5173`) på samma wifi.

### Supabase (gratis)
1. Skapa ett projekt på supabase.com.
2. Project Settings → API: kopiera **Project URL** och **anon/publishable key** till `.env`.
3. Klart – inga tabeller behövs. Rummen använder bara Realtime *Broadcast* + *Presence*.

### Installera som app
PWA-installation kräver HTTPS. Deploya `dist/` gratis till Vercel eller Netlify
(`npm run build`, lägg in samma två env-variabler där). Öppna sedan sidan i Safari/Chrome → "Lägg till på hemskärmen".

## Struktur
| Fil | Vad |
|---|---|
| `src/lib/songs.ts` | Kurerad låtlista med **originalår** – lägg till fler här |
| `src/lib/itunes.ts` | Hämtar 30 s-klipp från iTunes Search API (JSONP, ingen nyckel) |
| `src/lib/audio.ts` | Spelar 10 s, synkad starttid, upplåsning för iOS |
| `src/lib/room.ts` | Onlinerum: värden styr spelet och skickar läget till alla |
| `src/lib/game.ts` | Poäng, blandning, ranking |
| `src/views/*` | Start, En mobil, Online |

## Regler i kod
- Träffsäkerhet: 100 p för exakt år, −10 p per år fel, minst 0 (`accuracyPoints` i `game.ts`).
- Snabbhetsbonus (bara online): upp till +50 p, minskar linjärt med tiden från klippstart till gissning och multipliceras med träffsäkerheten – en snabb men vild gissning ger ingen bonus (`speedBonus`).
- Ingen gissning i tid = 0 poäng.
- Klippet startar 3 s efter att värden trycker, så alla mobiler hinner ladda och börjar samtidigt.
- Efter klippet finns 10/20/30 s extra att gissa (väljs i lobbyn). Svaret visas direkt när alla gissat och låten är slut.

## Tester
```bash
npm test   # poäng, låtlista, iTunes-matchning och en simulerad onlinematch
```
