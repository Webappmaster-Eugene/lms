import { afterEach, describe, expect, it, vi } from 'vitest'
import { callAnalysisModel, parseAnalysisJson, type AnalysisModelRequest } from '@/lib/interviews/analysis/model'

const request: AnalysisModelRequest = { model: 'test-model', messages: [{ role: 'user', content: 'test transcript' }], temperature: 0.2, maxTokens: 32_000, reasoningTokens: 4000, timeoutMs: 300_000 }
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Analysis provider boundary', () => {
  it('requires the server-side credential before any network operation', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(callAnalysisModel(request)).rejects.toThrow('не настроен')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses a fixed API target, bounded request and no redirects and parses the real provider model', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only-credential')
    const fetcher = vi.fn(async (_target: string, _options?: RequestInit) => new Response(JSON.stringify({ model: 'provider-model', choices: [{ finish_reason: 'stop', message: { content: '{"hrSummary":"test"}' } }] })))
    vi.stubGlobal('fetch', fetcher)
    await expect(callAnalysisModel({ ...request, pinVertex: true })).resolves.toEqual({ model: 'provider-model', finishReason: 'stop', text: '{"hrSummary":"test"}' })
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/chat/completions')
    const options = fetcher.mock.calls[0]?.[1]
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' })
    expect(JSON.parse(String(options?.body))).toMatchObject({ max_tokens: 32_000, reasoning: { max_tokens: 4000 }, provider: { allow_fallbacks: false } })
  })

  it('does not expose raw provider errors or credentials in user-facing failures', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only-credential')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private upstream content', { status: 402 })))
    await expect(callAnalysisModel(request)).rejects.toMatchObject({ message: 'Сервис анализа недоступен. Обратитесь к ментору.', retryable: false })
  })

  it('marks temporary provider failures as retryable without leaking their body', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only-credential')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private upstream content', { status: 429 })))
    await expect(callAnalysisModel(request)).rejects.toMatchObject({ retryable: true })
  })

  it('bounds streamed response size even without a Content-Length header', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only-credential')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(4 * 1024 * 1024 + 1))))
    await expect(callAnalysisModel(request)).rejects.toThrow('слишком большой')
  })

  it('accepts fenced or prose-wrapped report objects and rejects other JSON shapes', () => {
    expect(parseAnalysisJson('```json\n{"hrSummary":"test"}\n```')).toEqual({ hrSummary: 'test' })
    expect(parseAnalysisJson('Report: {"hrSummary":"test"}')).toEqual({ hrSummary: 'test' })
    for (const invalid of ['[]', 'null', 'true', 'broken']) expect(() => parseAnalysisJson(invalid)).toThrow('разобрать отчёт')
  })
})
