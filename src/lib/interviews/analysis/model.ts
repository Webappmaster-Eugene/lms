import 'server-only'

import { InterviewError } from '@/lib/interviews/analysis/errors'

export type ModelContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
export interface AnalysisModelRequest {
  model: string
  messages: Array<{ role: 'system' | 'user'; content: ModelContent }>
  temperature: number
  maxTokens: number
  reasoningTokens: number
  timeoutMs: number
  pinVertex?: boolean
  signal?: AbortSignal
}
export interface AnalysisModelAnswer { text: string; finishReason: string | null; model: string }
export type AnalysisModelCaller = (request: AnalysisModelRequest) => Promise<AnalysisModelAnswer>

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export const callAnalysisModel: AnalysisModelCaller = async (request) => {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) throw new InterviewError('Анализ пока не настроен. Обратитесь к ментору.')
  const signal = request.signal
    ? AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs)])
    : AbortSignal.timeout(request.timeoutMs)
  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', cache: 'no-store', signal, redirect: 'error',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.NEXT_PUBLIC_SERVER_URL || 'https://learn.mentorcareer.ru', 'X-Title': 'MentorCareer LMS' },
      body: JSON.stringify({
        model: request.model, messages: request.messages, temperature: request.temperature,
        max_tokens: request.maxTokens, reasoning: { max_tokens: request.reasoningTokens },
        ...(request.pinVertex ? { provider: { order: ['google-vertex/eu', 'google-vertex/global', 'google-vertex'], allow_fallbacks: false } } : {}),
      }),
    })
  } catch {
    throw new InterviewError('Сервис анализа сейчас не отвечает. Попробуйте позже.', { retryable: true })
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new InterviewError(response.status === 401 || response.status === 402 || response.status === 403
      ? 'Сервис анализа недоступен. Обратитесь к ментору.'
      : 'Сервис анализа временно недоступен. Попробуйте позже.', { retryable: response.status === 429 || response.status >= 500 || response.status === 404 })
  }
  const reader = response.body?.getReader()
  if (!reader) throw new InterviewError('Сервис анализа вернул пустой ответ.')
  const parts: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 4 * 1024 * 1024) throw new InterviewError('Ответ анализа слишком большой. Сократите запись.')
      parts.push(next.value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  let raw: Record<string, unknown>
  try { raw = record(JSON.parse(Buffer.concat(parts).toString('utf8'))) } catch { throw new InterviewError('Не удалось разобрать ответ сервиса анализа.') }
  const choices = Array.isArray(raw.choices) ? raw.choices : []
  const choice = record(choices[0])
  const message = record(choice.message)
  return {
    text: typeof message.content === 'string' ? message.content : '',
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
    model: typeof raw.model === 'string' ? raw.model : request.model,
  }
}

export function parseAnalysisJson(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const candidates = [normalized, normalized.match(/\{[\s\S]*\}/)?.[0]]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const value: unknown = JSON.parse(candidate)
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
    } catch { /* Try an outer object if the provider wrapped JSON in prose. */ }
  }
  throw new InterviewError('Не удалось разобрать отчёт модели. Попробуйте ещё раз.')
}
