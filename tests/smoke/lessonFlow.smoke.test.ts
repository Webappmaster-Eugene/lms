import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const COMPLETION = read('../../src/components/lesson/CompletionButton.tsx')
const NOTES = read('../../src/components/lesson/LessonNotes.tsx')

describe('сохранение прогресса не теряет ошибки', () => {
  it('каждый запрос кнопки «пройден» идёт через проверку ответа', () => {
    expect(COMPLETION).toContain('if (!response.ok)')
    expect(COMPLETION.match(/await send\(/g) ?? []).toHaveLength(3)
    // единственный прямой fetch — внутри самого помощника send
    expect(COMPLETION.match(/await fetch\(/g) ?? []).toHaveLength(1)
  })

  it('при ошибке состояние откатывается и пользователь видит текст', () => {
    expect(COMPLETION).toContain('setCompleted(initialCompleted)')
    expect(COMPLETION).toContain('setError(')
  })

  it('заметки проверяют статус на сохранении и удалении', () => {
    expect(NOTES.match(/if \(!res\.ok\)/g) ?? []).toHaveLength(3)
  })
})

describe('владелец записи проставляется одинаково во всех коллекциях', () => {
  it.each(['UserProgress', 'Notes', 'Comments'])('%s использует общий хук assignOwner', (name) => {
    const source = read(`../../src/payload/collections/${name}.ts`)

    expect(source).toContain('beforeChange: [assignOwner]')
    // Прежняя логика «только не-админам» роняла создание записи у админа
    expect(source).not.toMatch(/role !== 'admin'/)
  })
})

describe('сбои фоновых хуков видны в логах контейнера', () => {
  it('logger дублирует warn и error в stderr, а не только в телеметрию', () => {
    const telemetry = read('../../src/lib/telemetry.ts')

    expect(telemetry).toContain('severity >= SeverityNumber.WARN')
    expect(telemetry).toContain('console.error(')
  })
})
