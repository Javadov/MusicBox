// Vercel-funktion: söker i iTunes från servern.
// iTunes omdirigerar anrop från iPhone till musics:// (Apple Music-appen),
// så webbläsaren kan inte fråga iTunes direkt på iOS.
const COUNTRIES = new Set(['SE', 'US', 'GB', 'TR', 'AZ', 'DE'])

export async function GET(request) {
  const params = new URL(request.url).searchParams
  const term = (params.get('term') ?? '').slice(0, 200).trim()
  const country = COUNTRIES.has(params.get('country')) ? params.get('country') : 'SE'
  if (!term) return Response.json({ error: 'term saknas' }, { status: 400 })

  const url = new URL('https://itunes.apple.com/search')
  url.search = new URLSearchParams({ term, country, media: 'music', entity: 'song', limit: '15' }).toString()
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'MusicBox/1.0', accept: 'application/json' }, redirect: 'error' })
    if (!res.ok) return Response.json({ error: `iTunes ${res.status}` }, { status: 502 })
    const data = await res.json()
    return Response.json(data, {
      // samma sökning ger samma svar – låt Vercels CDN cacha ett dygn
      headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}
