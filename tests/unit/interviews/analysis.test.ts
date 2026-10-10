import { afterEach, describe, expect, it, vi } from 'vitest'
import { planAnalysisChunks } from '@/lib/interviews/analysis/chunk-plan'
import { normalizeCriteria } from '@/lib/interviews/analysis/criteria'
import { defaultInterviewCriteria } from '@/lib/interviews/analysis/default-criteria'
import { buildSpeechIndex, findQuote, parseReport } from '@/lib/interviews/analysis/report'
import { computeScore } from '@/lib/interviews/analysis/scoring'
import { analyzeRecording, isInterviewAnalysisConfigured } from '@/server/interviews/analyzer'
import type { AnalysisModelAnswer, AnalysisModelRequest } from '@/lib/interviews/analysis/model'

const criteria = normalizeCriteria([
  { id: 'js', name: 'JavaScript', description: 'Асинхронность', kind: 'must', weight: 3 },
  { id: 'talk', name: 'Коммуникация', kind: 'soft', weight: 1 },
])
const transcript = '[00:00:00] Спикер 1: Как работает event loop?\n[00:00:10] Спикер 2: Сначала выполняется синхронный код, потом очередь микрозадач.\n[00:00:55] Спикер 1: Спасибо, до свидания.'
const report = {
  candidateSpeaker: 'Спикер 2', hrSummary: 'Кандидат объясняет асинхронность на конкретном примере.',
  grade: { level: 'middle-', confidence: 'medium', rationale: 'Объясняет основную последовательность.' },
  criteria: [{ criterionId: 'js', score: 4, comment: 'Верно описал порядок.', evidence: [{ quote: 'Сначала выполняется синхронный код, потом очередь микрозадач.', timestamp: '19:00:00' }] }],
  growthAreas: ['Практиковать задачи с Promise и таймерами.'],
}
const answer = (text: string, model = 'test-model'): AnalysisModelAnswer => ({ text, model, finishReason: 'stop' })
const prepare = () => {
  const cleanup = vi.fn(async () => {})
  const prepareRecording = vi.fn(async () => ({ durationSeconds: 60, chunks: [{ path: 'test.ogg', startSeconds: 0, durationSeconds: 60 }], cleanup }))
  return { cleanup, prepareRecording }
}
const input = { downloadHref: 'https://downloader.disk.yandex.ru/test', directionSlug: 'react', criteria }

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Interview report and deterministic grading inherited from Sovetnik', () => {
  it('replaces invented quote timestamps with the actual cue and flags fabricated quotes', () => {
    const parsed = parseReport({ ...report, criteria: [{ ...report.criteria[0], evidence: [report.criteria[0].evidence[0], { quote: 'Я проектировал архитектуру систем с миллионами пользователей.', timestamp: '00:12:34' }] }] }, criteria, transcript)
    expect(parsed.criteria[0].evidence[0]).toMatchObject({ verified: true, timestamp: '00:00:10' })
    expect(parsed.criteria[0].evidence[1].verified).toBe(false)
    expect(parsed.grade?.level).toBe('middle_minus')
    expect(parsed.criteria[1].score).toBeNull()
  })

  it('does not confirm short generic answers and retains the order of quote excerpts', () => {
    const index = buildSpeechIndex(transcript)
    expect(findQuote('Спасибо', index)).toBeNull()
    expect(findQuote('Сначала выполняется синхронный код... потом очередь микрозадач', index)).toEqual({ timestamp: '00:00:10' })
    expect(findQuote('потом очередь микрозадач... Сначала выполняется синхронный код', index)).toBeNull()
  })

  it('limits a strong average when a must requirement fails and refuses low coverage', () => {
    const items = normalizeCriteria([
      { id: 'must', name: 'Обязательное', kind: 'must', weight: 1 },
      { id: 'nice', name: 'Дополнительное', kind: 'nice', weight: 3 },
    ])
    const scores = [{ criterionId: 'must', score: 2 as const, comment: '', evidence: [] }, { criterionId: 'nice', score: 5 as const, comment: '', evidence: [] }]
    expect(computeScore(items, scores)).toMatchObject({ overall: 81, verdict: 'maybe', failedMust: ['Обязательное'] })
    expect(computeScore(items, scores.slice(0, 1))).toMatchObject({ coverage: 0.25, verdict: 'insufficient_data' })
  })

  it('uses distinct React and Node.js technical criteria and includes live coding and communication', () => {
    expect(defaultInterviewCriteria('react').map((item) => item.id)).toEqual(expect.arrayContaining(['react', 'browser', 'livecoding', 'communication']))
    expect(defaultInterviewCriteria('nodejs').map((item) => item.id)).toEqual(expect.arrayContaining(['node', 'backend', 'livecoding', 'communication']))
    expect(defaultInterviewCriteria('go').map((item) => item.id)).toContain('language')
  })
})

describe('Private recording analysis pipeline', () => {
  it('does not prepare or send media until a configured explicit analysis call', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const prepared = prepare()
    expect(isInterviewAnalysisConfigured()).toBe(false)
    await expect(analyzeRecording(input, { prepareRecording: prepared.prepareRecording })).rejects.toThrow('не настроен')
    expect(prepared.prepareRecording).not.toHaveBeenCalled()
  })

  it('produces the real report shape and deterministic score and always removes temporary media', async () => {
    const prepared = prepare()
    const requests: AnalysisModelRequest[] = []
    const callModel = vi.fn(async (request: AnalysisModelRequest) => {
      requests.push(request)
      return request.temperature === 0 ? answer(transcript, 'speech-model') : answer(JSON.stringify(report), 'evaluation-model')
    })
    const progress = vi.fn(async () => {})
    const result = await analyzeRecording({ ...input, onProgress: progress }, { ...prepared, readAudio: async () => Buffer.from('test audio'), callModel })
    expect(result).toMatchObject({ model: 'evaluation-model', transcriptionModel: 'speech-model', score: { overall: 75, coverage: 0.75 }, report: { candidateSpeaker: 'Спикер 2' }, durationSeconds: 60 })
    expect(result.report.criteria[0].evidence[0].verified).toBe(true)
    expect(result.transcript).toBe(transcript)
    expect(requests[1].messages[0].content).toContain('Код на экране')
    expect(prepared.cleanup).toHaveBeenCalledOnce()
    expect(progress).toHaveBeenCalledTimes(3)
  })

  it('keeps speaker identity and shifts timestamps across consecutive audio chunks', async () => {
    const cleanup = vi.fn(async () => {})
    const requests: AnalysisModelRequest[] = []
    const second = '[00:00:00] Спикер 2: Для проверки напишу тест на асинхронный код.\n[00:00:55] Спикер 1: Спасибо за ответ.'
    const callModel = vi.fn(async (request: AnalysisModelRequest) => {
      requests.push(request)
      return answer(request.temperature === 0 ? (requests.length === 1 ? transcript : second) : JSON.stringify(report))
    })
    const result = await analyzeRecording(input, {
      callModel, readAudio: async () => Buffer.from('audio'),
      prepareRecording: async () => ({ durationSeconds: 120, chunks: [{ path: '1', startSeconds: 0, durationSeconds: 60 }, { path: '2', startSeconds: 60, durationSeconds: 60 }], cleanup }),
    })
    expect(result.transcript).toContain('[00:01:55] Спикер 1')
    expect(JSON.stringify(requests[1].messages)).toContain('Ранее в записи уже говорили: Спикер 1, Спикер 2')
    expect(JSON.stringify(requests[1].messages)).toContain('Сначала выполняется синхронный код')
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('rejects a model assessment of another speaker when the owner selected a specific candidate', async () => {
    const prepared = prepare()
    const callModel = vi.fn(async (request: AnalysisModelRequest) => request.temperature === 0 ? answer(transcript) : answer(JSON.stringify({ ...report, candidateSpeaker: 'Спикер 1' })))
    await expect(analyzeRecording({ ...input, candidateSpeaker: 'Спикер 2' }, { ...prepared, callModel, readAudio: async () => Buffer.from('audio') })).rejects.toThrow('указанного участника')
    expect(prepared.cleanup).toHaveBeenCalledOnce()
  })

  it('never evaluates a truncated or partially failed transcript', async () => {
    vi.stubEnv('MEETING_STT_MODEL_FALLBACKS', '')
    const prepared = prepare()
    const callModel = vi.fn(async () => ({ ...answer(transcript), finishReason: 'length' }))
    await expect(analyzeRecording(input, { ...prepared, callModel, readAudio: async () => Buffer.from('audio') })).rejects.toThrow('не завершила')
    expect(callModel).toHaveBeenCalledOnce()
    expect(prepared.cleanup).toHaveBeenCalledOnce()
  })

  it('rejects missing transcript coverage instead of scoring only the beginning', async () => {
    vi.stubEnv('MEETING_STT_MODEL_FALLBACKS', '')
    const prepared = prepare()
    const callModel = vi.fn(async () => answer('[00:00:05] Спикер 2: Сначала выполняется синхронный код, потом очередь микрозадач.'))
    await expect(analyzeRecording(input, { ...prepared, callModel, readAudio: async () => Buffer.from('audio') })).rejects.toThrow('неполная')
    expect(callModel).toHaveBeenCalledOnce()
    expect(prepared.cleanup).toHaveBeenCalledOnce()
  })

  it('falls back to another speech model while still requiring a complete transcript', async () => {
    vi.stubEnv('MEETING_STT_MODEL_FALLBACKS', 'fallback-speech')
    const prepared = prepare()
    const callModel = vi.fn(async (request: AnalysisModelRequest) => request.temperature !== 0 ? answer(JSON.stringify(report))
      : request.model === 'fallback-speech' ? answer(transcript, request.model) : answer('Я'))
    const result = await analyzeRecording(input, { ...prepared, callModel, readAudio: async () => Buffer.from('audio') })
    expect(result.transcriptionModel).toBe('fallback-speech')
    expect(callModel).toHaveBeenCalledTimes(3)
  })

  it('stops on cancellation and cleans prepared media without sending it to a model', async () => {
    const prepared = prepare()
    const controller = new AbortController()
    controller.abort()
    const callModel = vi.fn()
    await expect(analyzeRecording({ ...input, signal: controller.signal }, { ...prepared, callModel })).rejects.toThrow()
    expect(callModel).not.toHaveBeenCalled()
    expect(prepared.cleanup).toHaveBeenCalledOnce()
  })

  it('cleans media when the durable progress update fails', async () => {
    const prepared = prepare()
    const progress = vi.fn(async () => { if (progress.mock.calls.length === 2) throw new Error('Lease lost') })
    const callModel = vi.fn()
    await expect(analyzeRecording({ ...input, onProgress: progress }, { ...prepared, callModel })).rejects.toThrow('Lease lost')
    expect(prepared.cleanup).toHaveBeenCalledOnce()
    expect(callModel).not.toHaveBeenCalled()
  })

  it('does not fabricate a supplied speaker and cleans media when evaluation JSON is invalid', async () => {
    const prepared = prepare()
    const callModel = vi.fn(async (request: AnalysisModelRequest) => request.temperature === 0 ? answer(transcript) : answer('invalid'))
    await expect(analyzeRecording({ ...input, candidateSpeaker: 'Несуществующий участник' }, { ...prepared, callModel, readAudio: async () => Buffer.from('audio') })).rejects.toThrow('не найден')
    expect(prepared.cleanup).toHaveBeenCalledOnce()
    const other = prepare()
    await expect(analyzeRecording(input, { ...other, callModel, readAudio: async () => Buffer.from('audio') })).rejects.toThrow('разобрать отчёт')
    expect(other.cleanup).toHaveBeenCalledOnce()
  })
})


describe('Audio chunk boundaries', () => {
  it('keeps codec padding in the final real chunk instead of creating an empty extra chunk', () => {
    expect(planAnalysisChunks(600.0065)).toEqual([{ startSeconds: 0, durationSeconds: 600.0065 }])
    expect(planAnalysisChunks(1201)).toEqual([{ startSeconds: 0, durationSeconds: 600 }, { startSeconds: 600, durationSeconds: 601 }])
  })

  it('preserves a meaningful final fragment and all timestamps without dropping audio', () => {
    expect(planAnalysisChunks(605)).toEqual([{ startSeconds: 0, durationSeconds: 600 }, { startSeconds: 600, durationSeconds: 5 }])
    const chunks = planAnalysisChunks(14400)
    expect(chunks).toHaveLength(24)
    expect(chunks.reduce((total, chunk) => total + chunk.durationSeconds, 0)).toBe(14400)
    expect(planAnalysisChunks(Infinity)).toEqual([])
  })
})
