import { TRAINER_LIMITS } from './constants'
import type { TrainerLanguage } from './types'
import { isFrontendLanguage, isTrainerLanguage, parseFrontendFiles } from './runtime-spec'

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

export function interviewCode(input: unknown, language?: TrainerLanguage): string {
  if (typeof input !== 'string' || input.length > TRAINER_LIMITS.maxCodeLength) {
    throw new InterviewError(`Код должен быть строкой до ${TRAINER_LIMITS.maxCodeLength} символов`)
  }
  if (isFrontendLanguage(language)) {
    try { parseFrontendFiles(input) } catch (error) {
      throw new InterviewError(error instanceof Error ? error.message : 'Не удалось прочитать файлы проекта')
    }
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
  if (!isTrainerLanguage(input)) throw new InterviewError('Выберите язык из списка доступных языков')
  return input
}

export function interviewStarter(language: TrainerLanguage): string {
  if (language === 'python') return 'print("Готов к собеседованию")\n'
  if (language === 'go') return 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Готов к собеседованию")\n}\n'
  if (language === 'html') return JSON.stringify({
    'index.html': '<!doctype html>\n<html lang="ru">\n<head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head>\n<body><h1>Готов к собеседованию</h1></body>\n</html>',
    'styles.css': 'body { font-family: sans-serif; padding: 24px; }',
  })
  if (language === 'react') return JSON.stringify({
    'App.tsx': 'export default function App() {\n  return <h1>Готов к собеседованию</h1>\n}\n',
    'styles.css': 'body { font-family: sans-serif; padding: 24px; }',
  })
  if (language === 'next') return JSON.stringify({
    'app/page.tsx': 'export default function Page() {\n  return <h1>Готов к собеседованию</h1>\n}\n',
    'app/layout.tsx': 'import "./globals.css"\n\nexport default function Layout({ children }: { children: React.ReactNode }) {\n  return <html lang="ru"><body>{children}</body></html>\n}\n',
    'app/globals.css': 'body { font-family: sans-serif; padding: 24px; }',
  })
  return '// Обсудите условие и напишите решение\nconsole.log("Готов к собеседованию")\n'
}
