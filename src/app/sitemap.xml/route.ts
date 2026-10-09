export const GET = () => new Response(null, { status: 410, headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'public, max-age=3600' } })
