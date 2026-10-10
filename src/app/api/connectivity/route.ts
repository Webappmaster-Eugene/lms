export const dynamic = 'force-dynamic'

/** A reachability probe must not depend on database health or authentication. */
export function GET(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-LMS-Connectivity': '1',
    },
  })
}
