import { releaseRuntimePreview } from '@/server/trainer/runtime'

/** Удаляется только временный процесс по его непредсказуемому capability. */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response(null, { status: 404 })
  try {
    await releaseRuntimePreview(token)
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
