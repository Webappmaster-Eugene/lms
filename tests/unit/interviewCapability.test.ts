import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { InterviewRecording } from '@/payload-types'
import { createInterviewSource, interviewSourceFilename, validInterviewSource } from '@/server/interviews/capability'

/**
 * Подписанная ссылка, по которой сервис оценки забирает видео ученика.
 * Ссылка — единственный пропуск к приватному файлу, поэтому любая её порча
 * или чужой параметр должны давать отказ, а не исключение.
 */

const REQUESTED_AT = '2026-10-20T10:00:00.000Z'
const NOW = Date.parse('2026-10-20T12:00:00.000Z')
const doc = {
  id: 77, owner: 5, category: 'personal', status: 'ready', analysisBackend: 'sovetnik', analysisStatus: 'queued',
  analysisAttempts: 1, analysisRemoteKey: '7a3dc8a9-5b54-415b-a719-a4610b1408f2', analysisRequestedAt: REQUESTED_AT,
} as unknown as InterviewRecording

function signed(recording = doc) {
  const url = new URL(createInterviewSource(recording))
  return { file: url.pathname.split('/').at(-1) ?? '', params: url.searchParams }
}

beforeEach(() => {
  vi.stubEnv('PAYLOAD_SECRET', 'unit-capability-secret')
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
})
afterEach(() => vi.unstubAllEnvs())

describe('подписанный источник видео', () => {
  it('ссылка ведёт на публичный HTTPS-адрес LMS и действует сутки от запроса анализа', () => {
    const url = new URL(createInterviewSource(doc))
    expect(url.origin).toBe('https://learn.mentorcareer.ru')
    expect(url.pathname).toBe(`/api/internal/interviews/77/${interviewSourceFilename(doc)}`)
    expect(Number(url.searchParams.get('expires'))).toBe(Date.parse(REQUESTED_AT) / 1000 + 24 * 60 * 60)
    const { file, params } = signed()
    expect(validInterviewSource(doc, file, params, NOW)).toBe(true)
  })

  it.each(['http://learn.mentorcareer.ru', 'https://user:pass@learn.mentorcareer.ru'])('не выдаёт ссылку для небезопасного адреса %s', (origin) => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', origin)
    expect(() => createInterviewSource(doc)).toThrow('public HTTPS LMS origin')
  })

  it('без PAYLOAD_SECRET ссылку не подписать и не проверить', () => {
    const { file, params } = signed()
    vi.stubEnv('PAYLOAD_SECRET', '')
    expect(() => createInterviewSource(doc)).toThrow('not configured')
    expect(validInterviewSource(doc, file, params, NOW)).toBe(false)
  })

  it('после срока, слишком далёким сроком или чужим файлом не принимается', () => {
    const { file, params } = signed()
    const expires = Number(params.get('expires'))
    expect(validInterviewSource(doc, file, params, expires * 1000)).toBe(false)
    expect(validInterviewSource(doc, file.replace('lms-77', 'lms-78'), params, NOW)).toBe(false)
    const farFuture = new URLSearchParams(params)
    farFuture.set('expires', String(Math.floor(NOW / 1000) + 2 * 24 * 60 * 60))
    expect(validInterviewSource(doc, file, farFuture, NOW)).toBe(false)
  })

  it.each([
    ['лишний параметр', (params: URLSearchParams) => params.append('download', '1')],
    ['повтор токена', (params: URLSearchParams) => params.append('token', params.get('token') ?? '')],
    ['токен в верхнем регистре', (params: URLSearchParams) => params.set('token', (params.get('token') ?? '').toUpperCase())],
    ['срок не числом', (params: URLSearchParams) => params.set('expires', '1e10')],
    ['другой токен той же длины', (params: URLSearchParams) => params.set('token', 'a'.repeat(64))],
  ])('%s — отказ', (_, tamper) => {
    const { file, params } = signed()
    tamper(params)
    expect(validInterviewSource(doc, file, params, NOW)).toBe(false)
  })

  it('подпись привязана к попытке: после повтора анализа старая ссылка недействительна', () => {
    const { file, params } = signed()
    const retried = { ...doc, analysisAttempts: 2 } as InterviewRecording
    expect(validInterviewSource(retried, file, params, NOW)).toBe(false)
  })

  it.each([
    ['общая запись', { category: 'mentor' }],
    ['анализ завершён', { analysisStatus: 'completed' }],
    ['видео ещё загружается', { status: 'uploading' }],
  ])('%s — отказ даже с верной подписью', (_, patch) => {
    const { file, params } = signed()
    expect(validInterviewSource({ ...doc, ...patch } as InterviewRecording, file, params, NOW)).toBe(false)
  })

  // Дефект capability.ts:28 — проверка `!relationId(doc.owner)` задумана как отказ,
  // но relationId бросает TypeError на пустой связи. Маршрут источника ловит
  // исключение и отвечает 404, так что наружу это не выходит; другой вызывающий упадёт.
  it.fails('запись без владельца даёт отказ, а не исключение — дефект: capability.ts:28 бросает TypeError из relationId', () => {
    const { file, params } = signed()
    expect(validInterviewSource({ ...doc, owner: null } as unknown as InterviewRecording, file, params, NOW)).toBe(false)
  })

  it('запись без ключа попытки даёт отказ, а не исключение', () => {
    const { file, params } = signed()
    expect(validInterviewSource({ ...doc, analysisRemoteKey: null } as InterviewRecording, file, params, NOW)).toBe(false)
    expect(validInterviewSource({ ...doc, analysisRemoteKey: '../../../etc/passwd' } as InterviewRecording, file, params, NOW)).toBe(false)
  })
})
