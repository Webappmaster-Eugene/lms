import 'server-only'

import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { MAX_RECORDING_BYTES } from '@/lib/interviews/types'
import { safeLearningUpstream } from '@/server/learning-upstream'
import { InterviewError } from '@/lib/interviews/analysis/errors'
import { planAnalysisChunks } from '@/lib/interviews/analysis/chunk-plan'
export { ANALYSIS_CHUNK_SECONDS } from '@/lib/interviews/analysis/chunk-plan'

const run = promisify(execFile)
export const MAX_ANALYSIS_RECORDING_BYTES = MAX_RECORDING_BYTES
export const MAX_ANALYSIS_DURATION_SECONDS = 4 * 60 * 60
const FORMATS = 'mov,matroska,webm,avi,flv,ogg,mp3,wav,aac,mpeg,mpegvideo,mpegts'
const INPUT_GUARDS = ['-max_alloc', '67108864', '-protocol_whitelist', 'file,pipe', '-format_whitelist', FORMATS]
export interface PreparedRecording {
  durationSeconds: number
  chunks: Array<{ path: string; startSeconds: number; durationSeconds: number }>
  cleanup: () => Promise<void>
}
export type PrepareRecording = (downloadHref: string, signal?: AbortSignal) => Promise<PreparedRecording>

export async function downloadAnalysisRecording(href: string, filePath: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
  const timeout = AbortSignal.timeout(30 * 60 * 1000)
  const downloadSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  let target = safeLearningUpstream(href)
  let response: Response | undefined
  for (let redirects = 0; redirects <= 3; redirects++) {
    response = await fetcher(target, { cache: 'no-store', redirect: 'manual', signal: downloadSignal, headers: { 'Accept-Encoding': 'identity' } })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirects === 3) throw new InterviewError('Источник записи недоступен.')
    target = safeLearningUpstream(new URL(location, target).href)
  }
  if (!response?.ok || !response.body) {
    await response?.body?.cancel()
    throw new InterviewError('Не удалось скачать запись. Попробуйте позже.', { retryable: true })
  }
  const lengthHeader = response.headers.get('content-length')
  const declared = lengthHeader == null ? null : Number(lengthHeader)
  if ((declared != null && (!Number.isSafeInteger(declared) || declared < 1 || declared > MAX_ANALYSIS_RECORDING_BYTES)) || ![null, 'identity'].includes(response.headers.get('content-encoding'))) {
    await response.body.cancel()
    throw new InterviewError('Запись слишком большая или имеет неподдерживаемый формат передачи.')
  }
  let downloaded = 0
  const bound = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.byteLength
      callback(downloaded > MAX_ANALYSIS_RECORDING_BYTES ? new InterviewError('Запись превышает 2 ГБ.') : null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), bound, createWriteStream(filePath, { flags: 'wx', mode: 0o600 }), { signal: downloadSignal })
    if (downloaded === 0 || (declared != null && downloaded !== declared)) throw new InterviewError('Запись загрузилась не полностью. Попробуйте ещё раз.')
  } catch (error) {
    await rm(filePath, { force: true })
    if (error instanceof InterviewError) throw error
    throw new InterviewError('Не удалось загрузить запись для анализа. Попробуйте позже.', { retryable: true })
  }
}

export const prepareAnalysisRecording: PrepareRecording = async (href, signal) => {
  const directory = await mkdtemp(join(tmpdir(), 'lms-interview-'))
  const cleanup = async () => { await rm(directory, { recursive: true, force: true }) }
  try {
    await chmod(directory, 0o700)
    const input = join(directory, 'recording')
    await downloadAnalysisRecording(href, input, signal)
    const probe = await run('ffprobe', ['-v', 'error', ...INPUT_GUARDS, '-show_entries', 'format=duration:stream=codec_type,duration', '-of', 'json', input], { signal, timeout: 60_000, maxBuffer: 1024 * 1024 })
    const info = JSON.parse(probe.stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; duration?: string }> }
    if (!info.streams?.some((stream) => stream.codec_type === 'audio')) throw new InterviewError('В записи нет звуковой дорожки.')
    const duration = Number(info.format?.duration)
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_ANALYSIS_DURATION_SECONDS) throw new InterviewError('Для анализа нужна запись длительностью до 4 часов с корректной звуковой дорожкой.')
    const plan = planAnalysisChunks(duration)
    const boundaries = plan.slice(1).map((chunk) => chunk.startSeconds)
    const segmentOptions = boundaries.length > 0 ? ['-segment_times', boundaries.join(',')] : ['-segment_time', String(duration + 1)]
    await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', ...INPUT_GUARDS, '-i', input, '-map', '0:a:0', '-t', String(duration), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '24k', '-threads', '1', '-f', 'segment', ...segmentOptions, '-reset_timestamps', '1', join(directory, 'audio-%03d.ogg')], { signal, timeout: 30 * 60 * 1000, maxBuffer: 1024 * 1024 })
    const names = (await readdir(directory)).filter((name) => /^audio-\d{3}\.ogg$/.test(name)).sort()
    if (names.length !== plan.length) throw new InterviewError('Не удалось подготовить всю запись. Анализ остановлен.')
    const chunks: PreparedRecording['chunks'] = []
    for (const [index, name] of names.entries()) {
      const path = join(directory, name)
      if ((await stat(path)).size < 4000) throw new InterviewError('В записи обнаружен пустой или повреждённый фрагмент.')
      const timing = plan[index]
      if (!timing) throw new InterviewError('Не удалось подготовить весь звук записи.')
      chunks.push({ path, ...timing })
    }
    return { chunks, durationSeconds: duration, cleanup }
  } catch (error) {
    await cleanup()
    if (error instanceof InterviewError) throw error
    throw new InterviewError('Не удалось подготовить звук. Попробуйте позже или обратитесь к ментору.', { retryable: true })
  }
}
