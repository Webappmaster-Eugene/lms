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

  it('презентация принимает файлы Диска и медиатеки или одну ссылку на папку', () => {
    const lesson = (block: Record<string, unknown>) => ({ title: 'Урок', course: 1, content: [{ blockType: 'slides', title: 'Гайд', ...block }] })
    const file = 'https://disk.yandex.ru/d/key/%D0%93%D0%B0%D0%B9%D0%B4/1.png'
    expect(() => validateContentInput('lessons', lesson({ items: [{ id: 'a', url: file, fileName: '1.png', caption: 'Начало' }, { url: '/api/media/file/scheme.png' }] }))).not.toThrow()
    expect(() => validateContentInput('lessons', lesson({ folderUrl: 'https://disk.yandex.ru/d/key/guide', items: [] }))).not.toThrow()
    expect(() => validateContentInput('lessons', lesson({ description: 'Слайды', folderUrl: '', items: [{ url: 'https://disk.yandex.ru/i/single' }] }))).not.toThrow()
  })

  it.each<[string, Record<string, unknown>, string]>([
    ['нет ни файлов, ни папки', { items: [], folderUrl: ' ' }, 'добавьте файлы или ссылку на папку'],
    ['чужой сайт', { items: [{ url: 'https://example.com/a.png' }] }, 'файл 1: нужна ссылка на файл на Яндекс Диске'],
    ['видео', { items: [{ url: 'https://disk.yandex.ru/d/key/a.png' }, { url: 'https://disk.yandex.ru/d/key/lesson.mp4' }] }, 'файл 2: видео добавляйте блоком «Видео»'],
    ['папка в списке файлов', { items: [{ url: 'https://disk.yandex.ru/d/key' }] }, 'ссылка на папку'],
    ['пробел в адресе', { items: [{ url: 'https://disk.yandex.ru/d/key/a b.png' }] }, 'недопустимые символы'],
    ['папка не ссылкой', { folderUrl: 'guide', items: [] }, 'публичная ссылка Яндекс Диска'],
    ['в поле папки ссылка на отдельный файл', { folderUrl: 'https://disk.yandex.ru/i/AbCdEf123', items: [] }, 'ссылка на отдельный файл'],
    ['лишнее поле файла', { items: [{ url: '/api/media/file/a.png', html: '<b>' }] }, 'нельзя изменять'],
    ['слишком длинная подпись', { items: [{ url: '/api/media/file/a.png', caption: 'x'.repeat(301) }] }, '300'],
    ['больше 300 файлов', { items: Array.from({ length: 301 }, (_, index) => ({ url: `/api/media/file/${index}.png` })) }, 'не более 300'],
  ])('презентация: %s — отказ с объяснением', (_label, block, message) => {
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'slides', title: 'Гайд', ...block }] })).toThrow(message)
  })

  it('текст из репозитория меняет только импорт: в редакторе его можно переставить или удалить', () => {
    const markdown = { id: 'md-1', blockType: 'markdown', markdown: '## Теория\n\nТекст', source: 'nodejs-bootcamp 08-outbox theory v0.1.1' }
    const text = { id: 'text-1', blockType: 'text', content: richText }
    const existing = { content: [markdown, text] }
    const update = (content: unknown[]) => validateContentInput('lessons', { content, expectedUpdatedAt: timestamp }, true, { existing })
    expect(update([text, markdown]).data.content).toEqual([text, markdown])
    expect(update([{ ...markdown, blockName: 'Методичка' }, text]).data.content).toHaveLength(2)
    expect(update([text]).data.content).toEqual([text])
    const withoutSource = { id: 'md-3', blockType: 'markdown', markdown: '## Практикум' }
    const stored = { content: [{ ...withoutSource, source: null }, text] }
    expect(validateContentInput('lessons', { content: [text, withoutSource], expectedUpdatedAt: timestamp }, true, { existing: stored }).data.content).toHaveLength(2)
    expect(() => update([{ ...markdown, markdown: '## Теория\n\nПравка' }])).toThrow('только импортом')
    expect(() => update([{ ...markdown, source: 'другой источник' }])).toThrow('только импортом')
    expect(() => update([{ ...markdown, id: 'md-2' }])).toThrow('только импортом')
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'markdown', markdown: '# Новый' }] })).toThrow('только импортом')
    expect(() => update([{ ...markdown, extra: true }])).toThrow()
  })

  it('презентация без названия не сохраняется', () => {
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'slides', title: ' ', items: [{ url: '/api/media/file/a.png' }] }] })).toThrow('Название блока')
  })

  it('не принимает неожиданные поля блока или повторные IDs', () => {
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'text', content: richText, html: '<script>' }] })).toThrow('нельзя изменять')
    expect(() => validateContentInput('lessons', { title: 'Урок', course: 1, content: [{ blockType: 'text', content: richText, id: 'same' }, { blockType: 'text', content: richText, id: 'same' }] })).toThrow('повторяться')
  })
})

describe('Lexical: внутренние ссылки, медиа и связи', () => {
  const paragraphWith = (node: Record<string, unknown>) => ({
    root: { type: 'root', version: 1, children: [{ type: 'paragraph', version: 1, children: [node] }] },
  })
  const internalLink = (doc: unknown) => paragraphWith({ type: 'link', version: 3, fields: { linkType: 'internal', doc, newTab: false }, children: [] })

  it('внутренняя ссылка принимается только на курс, урок или роадмап с целым ID', () => {
    expect(() => validateLexical(internalLink({ relationTo: 'lessons', value: 12 }))).not.toThrow()
    expect(() => validateLexical(internalLink({ relationTo: 'users', value: 12 }))).toThrow('Неподдерживаемая внутренняя ссылка')
    expect(() => validateLexical(internalLink({ relationTo: 'courses', value: '12' }))).toThrow('Внутренняя ссылка: требуется положительный целый ID')
    expect(() => validateLexical(internalLink({ relationTo: 'courses', value: 12, url: 'javascript:alert(1)' }))).toThrow('нельзя изменять')
    expect(() => validateLexical(internalLink(undefined))).toThrow('Внутренняя ссылка: требуется объект')
  })

  it('ссылка без fields проверяется по собственному url', () => {
    expect(() => validateLexical(paragraphWith({ type: 'autolink', version: 2, url: 'https://nodejs.org/docs', children: [] }))).not.toThrow()
    expect(() => validateLexical(paragraphWith({ type: 'autolink', version: 2, url: 'javascript:alert(1)', children: [] }))).toThrow('http')
  })

  it('картинка в тексте — только из медиатеки и с целым ID', () => {
    expect(() => validateLexical(paragraphWith({ type: 'upload', version: 3, relationTo: 'media', value: 4 }))).not.toThrow()
    expect(() => validateLexical(paragraphWith({ type: 'upload', version: 3, relationTo: 'users', value: 4 }))).toThrow('из медиатеки')
    expect(() => validateLexical(paragraphWith({ type: 'upload', version: 3, relationTo: 'media', value: 0 }))).toThrow('Медиа')
  })

  it('неизвестный тип узла или неподдержанная версия узла отклоняются', () => {
    expect(() => validateLexical(paragraphWith({ type: 'html', version: 1, html: '<script>alert(1)</script>' }))).toThrow('Неподдерживаемый формат узла текста')
    expect(() => validateLexical(paragraphWith({ type: 'link', version: 4, url: 'https://nodejs.org', children: [] }))).toThrow('Неподдерживаемый формат узла текста')
    expect(() => validateLexical(paragraphWith({ type: 'upload', version: '3', relationTo: 'media', value: 4 }))).toThrow('Неподдерживаемый формат узла текста')
    expect(() => validateLexical(paragraphWith({ type: 'text', version: 2, text: 'Привет' }))).toThrow('Неподдерживаемый формат узла текста')
  })

  it('связь в тексте — только с курсом, уроком или роадмапом', () => {
    expect(() => validateLexical(paragraphWith({ type: 'relationship', version: 2, relationTo: 'roadmaps', value: 3 }))).not.toThrow()
    expect(() => validateLexical(paragraphWith({ type: 'relationship', version: 2, relationTo: 'users', value: 3 }))).toThrow('Неподдерживаемая связь в тексте')
    expect(() => validateLexical(paragraphWith({ type: 'relationship', version: 2, relationTo: 'lessons', value: -1 }))).toThrow('Связь в тексте')
  })
})

describe('slug и курсы-пререквизиты', () => {
  const course = (data: Record<string, unknown>) => validateContentInput('courses', { title: 'Курс', roadmap: 1, ...data })

  it('slug — только латиница, цифры и одиночные дефисы', () => {
    expect(course({ slug: 'node-js-22' }).data.slug).toBe('node-js-22')
    expect(() => course({ slug: 'Node JS' })).toThrow('Slug: латинские буквы, цифры и дефисы')
    expect(() => course({ slug: 'node--js' })).toThrow('Slug')
    expect(() => course({ slug: 'курс' })).toThrow('Slug')
  })

  it('пререквизиты — список целых ID не длиннее 100, null очищает список', () => {
    expect(course({ prerequisites: [1, 2] }).data.prerequisites).toEqual([1, 2])
    expect(course({ prerequisites: null }).data.prerequisites).toBeNull()
    expect(() => course({ prerequisites: 3 })).toThrow('Не более 100 курсов-пререквизитов')
    expect(() => course({ prerequisites: Array.from({ length: 101 }, (_, index) => index + 1) })).toThrow('Не более 100')
    expect(() => course({ prerequisites: [1, '2'] })).toThrow('Пререквизит: требуется положительный целый ID')
  })
})
