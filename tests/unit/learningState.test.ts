import { describe, expect, it } from 'vitest'
import { learningMutation } from '@/server/learning-state'
import { learningVideos, newerPosition, readVideoPositions } from '@/lib/learning-state'
import type { Lesson } from '@/payload-types'

const first = { blockType: 'video' as const, id: 'stable', title: 'Видео', videoUrl: 'https://disk.yandex.ru/d/course/a.mp4', displayMode: 'embed' as const }

describe('идентичность и состояние видео', () => {
  it('id сохраняется при перестановке и смене заголовка, но меняется при замене файла', () => {
    const original = learningVideos({ content: [first] })[0].id
    expect(learningVideos({ content: [{ blockType: 'link', title: 'Текст', url: 'https://example.test' }, { ...first, title: 'Новый заголовок' }] })[0].id).toBe(original)
    expect(learningVideos({ content: [{ ...first, videoUrl: '/api/media/file/replacement.mp4' }] })[0].id).not.toBe(original)
  })

  it('видео из link/file становится отдельной записью; внешние iframe не обещают точную позицию', () => {
    const content = [
      { blockType: 'link', id: 'download', title: 'Запись TS', url: 'https://disk.yandex.ru/d/course/b.ts' },
      { blockType: 'file', id: 'upload', title: 'Медиатека', file: { id: 1, url: '/api/media/file/demo.webm', mimeType: 'video/webm' } },
      { ...first, id: 'external', videoUrl: 'https://youtube.com/watch?v=external' },
    ] as Lesson['content']
    expect(learningVideos({ content }).map((video) => video.title)).toEqual(['Запись TS', 'Медиатека'])
  })

  it('новизна определяется событием просмотра, а не большей секундой: перемотка назад сохраняется', () => {
    const server = { seconds: 300, at: 100, ended: false }
    const rewound = { seconds: 20, at: 101, ended: false }
    expect(newerPosition(server, rewound)).toEqual(rewound)
    expect(newerPosition(rewound, server)).toEqual(rewound)
  })

  it('испорченные JSON-позиции не применяются', () => {
    expect(readVideoPositions({ a: { seconds: -1, at: 1, ended: false }, b: { seconds: 10, at: 1 }, c: { seconds: 7, at: 1, ended: false } })).toEqual({ c: { seconds: 7, at: 1, ended: false } })
  })

  it('валидация не принимает user/positions от клиента, а timestamp будущего ограничен', () => {
    expect(learningMutation({ lessonId: 1, at: 101, user: 99, positions: { bad: {} }, videoId: 'clip', seconds: 7.9, ended: false }, 100)).toEqual({ lessonId: 1, mutation: { at: 100, videoId: 'clip', seconds: 7, ended: false } })
    expect(() => learningMutation({ lessonId: 1, at: 60101 }, 100)).toThrow('Некорректное время просмотра')
  })
})
