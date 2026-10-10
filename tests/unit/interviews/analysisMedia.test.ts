import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadAnalysisRecording, MAX_ANALYSIS_RECORDING_BYTES } from '@/lib/interviews/analysis/media'

const directories: string[] = []
async function destination(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'lms-test-interview-'))
  directories.push(directory)
  return join(directory, 'video')
}
const href = 'https://downloader.disk.yandex.ru/file/test'
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

describe('Private bounded Yandex media download', () => {
  it('only requests validated Yandex HTTPS hosts', async () => {
    const fetcher = vi.fn()
    for (const url of ['http://downloader.disk.yandex.ru/video', 'https://127.0.0.1/file', 'https://yandex.ru.evil.test/file', 'https://user:password@downloader.disk.yandex.ru/file', 'https://downloader.disk.yandex.ru:444/file']) {
      await expect(downloadAnalysisRecording(url, await destination(), undefined, fetcher)).rejects.toThrow()
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects off-site redirects before following them', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }))
    await expect(downloadAnalysisRecording(href, await destination(), undefined, fetcher)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('refuses an excessive declared size without reading the file', async () => {
    const fetcher = vi.fn(async () => new Response('x', { headers: { 'Content-Length': String(MAX_ANALYSIS_RECORDING_BYTES + 1) } }))
    const path = await destination()
    await expect(downloadAnalysisRecording(href, path, undefined, fetcher)).rejects.toThrow('слишком большая')
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps downloaded bytes in a private file and forwards neither secrets nor cookies', async () => {
    const fetcher = vi.fn(async (_target: string | URL | Request, _options?: RequestInit) => new Response('video', { headers: { 'Content-Length': '5' } }))
    const path = await destination()
    await downloadAnalysisRecording(href, path, undefined, fetcher)
    expect(await readFile(path, 'utf8')).toBe('video')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', cache: 'no-store', headers: { 'Accept-Encoding': 'identity' } })
  })

  it('deletes partially transferred media after a declared-size mismatch', async () => {
    const fetcher = vi.fn(async () => new Response('bad', { headers: { 'Content-Length': '8' } }))
    const path = await destination()
    await expect(downloadAnalysisRecording(href, path, undefined, fetcher)).rejects.toThrow('не полностью')
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
