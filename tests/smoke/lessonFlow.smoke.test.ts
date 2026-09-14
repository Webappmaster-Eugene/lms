import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const COMPLETION = read('../../src/components/lesson/CompletionButton.tsx')
const NOTES = read('../../src/components/lesson/LessonNotes.tsx')
const COMMENTS = read('../../src/components/lesson/LessonComments.tsx')
const PLAYER = read('../../src/components/lesson/VideoPlayer.tsx')
const TS_PLAYER = read('../../src/components/lesson/TransportStreamPlayer.tsx')
const LESSON_PAGE = read('../../src/app/(frontend)/lessons/[slug]/page.tsx')

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

describe('id урока уходит на сервер числом', () => {
  // Payload отвергает строковый id в relationship-поле: запись прогресса, заметки
  // и комментария падала с 400 «This relationship field has the following invalid relationships».
  it.each([
    ['CompletionButton', COMPLETION],
    ['LessonNotes', NOTES],
    ['LessonComments', COMMENTS],
  ])('%s принимает lessonId числом', (_name, source) => {
    expect(source).toMatch(/lessonId: number/)
    expect(source).not.toMatch(/lessonId: string/)
  })

  it('страница урока передаёт id без приведения к строке', () => {
    expect(LESSON_PAGE).not.toContain('lessonId={String(')
    expect(LESSON_PAGE.match(/lessonId=\{lesson\.id\}/g) ?? []).toHaveLength(3)
  })
})

describe('видео выбирает плеер по контейнеру', () => {
  it('поток MPEG-TS уходит в отдельный плеер через прокси', () => {
    expect(PLAYER).toContain('isTransportStream')
    expect(PLAYER).toContain('TransportStreamPlayer')
    expect(PLAYER).toContain('/api/yandex-disk/proxy')
  })

  it('обычное видео по-прежнему идёт нативно через редирект, без прокси', () => {
    expect(PLAYER).toContain('/api/yandex-disk/stream')
    // прокси упоминается ровно один раз — в ветке потока
    expect(PLAYER.match(/api\/yandex-disk\/proxy/g) ?? []).toHaveLength(1)
  })

  it('тяжёлая библиотека грузится только для таких видео', () => {
    expect(TS_PLAYER).toContain("await import('mpegts.js')")
    expect(PLAYER).not.toContain("from 'mpegts.js'")
  })

  it('загрузчику отдаётся абсолютный адрес — в blob-воркере относительный не разрешается', () => {
    expect(TS_PLAYER).toContain('new URL(src, window.location.origin)')
  })

  it('плееру потока передаётся длительность урока — в контейнере её нет', () => {
    expect(PLAYER).toContain('durationMinutes={durationMinutes}')
    expect(TS_PLAYER).toContain('duration * 1000')
  })

  it('у потока своя панель: нативная показала бы его эфиром, без шкалы', () => {
    expect(TS_PLAYER).toContain('Перемотка')
    expect(TS_PLAYER).toContain('formatTime')
    // нативные controls не включаем — они не знают длительности
    expect(TS_PLAYER).not.toMatch(/<video[^>]*\scontrols/)
  })

  it('перемотка ограничена загруженной частью — в контейнере нет оглавления', () => {
    expect(TS_PLAYER).toContain('video.buffered.end(video.buffered.length - 1)')
    expect(TS_PLAYER).toContain('Math.min(Math.max(seconds, first)')
  })

  it('отказ нативного плеера переводит на поток, и только потом на карточку', () => {
    // часть потоков лежит под именем .mp4 — по расширению их не отличить
    expect(PLAYER).toContain("setMode('stream')")
    expect(PLAYER).toContain("setMode('link')")
    expect(PLAYER).toContain('onError={handleNativeFailure}')
    expect(PLAYER).toContain('onFailure={handleStreamFailure}')
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
