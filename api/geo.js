// Vercel-funktion: vilket land besökaren befinner sig i, utifrån IP-adressen.
// Vercel lägger landet i headern x-vercel-ip-country – inget externt API eller IP lagras.
export function GET(request) {
  const country = request.headers.get('x-vercel-ip-country') || null
  return Response.json({ country }, { headers: { 'cache-control': 'private, no-store' } })
}
