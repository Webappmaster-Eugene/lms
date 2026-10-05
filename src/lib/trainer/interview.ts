import { TRAINER_LIMITS } from './constants'
import type { TrainerLanguage } from './types'

export type InterviewParticipant = { id: number; name: string; lastSeen: string }
export type InterviewRoom = {
  token: string
  ownerId: number
  title: string
  descriptionMd: string
  setupCode: string
  code: string
  language: TrainerLanguage
  version: number
  createdAt: string
  endedAt: string | null
  participants: InterviewParticipant[]
}

export class InterviewError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
  }
}

export function validRoomToken(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
}

export function interviewBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InterviewError('Невалидные данные')
  return input as Record<string, unknown>
}

export function interviewCode(input: unknown): string {
  if (typeof input !== 'string' || input.length > TRAINER_LIMITS.maxCodeLength) {
    throw new InterviewError(`Код должен быть строкой до ${TRAINER_LIMITS.maxCodeLength} символов`)
  }
  return input
}

export function interviewVersion(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) {
    throw new InterviewError('Требуется версия комнаты')
  }
  return input
}

export function interviewLanguage(input: unknown): TrainerLanguage {
  if (input !== 'js' && input !== 'ts') throw new InterviewError('Выберите JavaScript или TypeScript')
  return input
}
