import { describe, expect, it } from 'vitest'
import { contentCollection, validateContentInput, validateContentUrl, validateLexical } from '@/lib/content-management/validation'

const richText = {
  root: { type: 'root', version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: 'Практика Node.js' }] }] },
}
const timestamp = '2026-10-04T12:00:00.000Z'

describe('Валидация управления учебным контентом', () => {
  it('разрешает только три коллекции учебного контента', () => {
    expect(contentCollection('lessons')).toBe('lessons')
    expect(() => contentCollection('users')).toThrow('не поддерживается')
  })

  it.each([null, [], 1, 'текст'])('не принимает произвольный JSON: %j', (input) => {
    expect(() => validateContentInput('courses', input)).toThrow()
  })

  it('строго проверяет поля, родительский ID и публикацию', () => {
    expect(() => validateContentInput('courses', { title: 'Курс', roadmap: 1, id: 2 })).toThrow('нельзя изменять')
    expect(() => validateContentInput('lessons', { title: 'Урок', course: '1' })).toThrow('целый ID')
    expect(() => validateContentInput('sections', { title: 'Раздел', course: 1, isPublished: 'false' })).toThrow('boolean')
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, order: -1 })).toThrow()
  })

  it('редактирование обязательно несёт timestamp, а partial update не требует заголовка', () => {
    expect(() => validateContentInput('lessons', { description: 'Описание' }, true)).toThrow('expectedUpdatedAt')
    expect(validateContentInput('lessons', { description: 'Описание', expectedUpdatedAt: timestamp }, true)).toEqual({ data: { description: 'Описание' }, expectedUpdatedAt: timestamp })
    expect(() => validateContentInput('lessons', { expectedUpdatedAt: timestamp }, true)).toThrow('Нет изменений')
  })

  it('соблюдает реальные лимиты описаний раздела и урока', () => {
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, description: 'x'.repeat(301) })).toThrow('300')
    expect(() => validateContentInput('sections', { title: 'Раздел', course: 1, description: 'x'.repeat(501) })).toThrow('500')
    expect(validateContentInput('courses', { title: 'Курс', roadmap: 1, description: richText }).data.description).toBe(richText)
  })

  it.each(['javascript:alert(1)', 'data:text/html,abc', 'file:///etc/passwd', '//evil.test/x', '/\\evil.test/x', 'https://x.test/\nabc', 'https://user:pass@x.test'])('блокирует опасную ссылку %s', (url) => {
    expect(() => validateContentUrl(url, true)).toThrow()
  })

  it('ссылки поддерживают http(s) и внутренние пути, видео требуют абсолютный URL', () => {
    expect(() => validateContentUrl('/courses/nodejs?mode=study', true)).not.toThrow()
    expect(() => validateContentUrl('https://disk.yandex.ru/d/test')).not.toThrow()
    expect(() => validateContentUrl('/api/video')).toThrow()
  })

  it('проверяет Lexical и ссылки внутри форматированного текста', () => {
    expect(() => validateLexical(richText)).not.toThrow()
    expect(() => validateLexical({ root: { type: 'root', version: 1 } })).toThrow()
    expect(() => validateLexical({ root: { type: 'root', version: 1, children: [{ type: 'link', version: 1, fields: { url: 'javascript:alert(1)' }, children: [] }] } })).toThrow()
  })

  it('поддерживает все шесть блоков с native Payload именами', () => {
    const content = [
      { blockType: 'text', content: richText },
      { blockType: 'video', title: 'Node.js', videoUrl: 'https://youtube.com/watch?v=node', displayMode: 'embed' },
      { blockType: 'image', image: 1, altText: 'Схема' },
      { blockType: 'link', title: 'Материал', url: '/courses/node', platform: 'other' },
      { blockType: 'miro', title: 'Доска', embedUrl: 'https://miro.com/app/embed/test', height: 600 },
      { blockType: 'file', title: 'Задание', file: 2 },
    ]
    expect(validateContentInput('lessons', { title: 'Урок', course: 1, content }).data.content).toBe(content)
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'file', title: 'Задание', file: { id: 2 } }] })).toThrow('целый ID')
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'miro', title: 'Доска', embedUrl: 'https://evil.test/app/embed/a' }] })).toThrow('miro.com')
  })

  it('не принимает неожиданные поля блока или повторные IDs', () => {
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'text', content: richText, html: '<script>' }] })).toThrow('нельзя изменять')
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'text', content: richText, id: 'same' }, { blockType: 'text', content: richText, id: 'same' }] })).toThrow('повторяться')
  })
})
