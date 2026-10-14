import { describe, expect, it } from 'vitest'

import { metaDescription, OG_IMAGE, ROOT_METADATA, titleWithContext } from '@/lib/site-metadata'

describe('описание страницы для мета-тега', () => {
  it('короткий текст остаётся как есть, пробелы схлопываются', () => {
    expect(metaDescription('  Восьмое занятие\n\nакселератора.  ')).toBe('Восьмое занятие акселератора.')
  })

  it('пустое описание не выводится, чтобы сработало общее описание платформы', () => {
    expect(metaDescription('')).toBeUndefined()
    expect(metaDescription('   ')).toBeUndefined()
    expect(metaDescription(null)).toBeUndefined()
  })

  it('длинный текст режется по границе слова до 160 символов', () => {
    const text = 'Слово '.repeat(60)
    const result = metaDescription(text)!
    expect(result.length).toBeLessThanOrEqual(160)
    expect(result.endsWith('Слово…')).toBe(true)
  })

  it('ссылки Яндекс Диска из описания урока не попадают в мета-тег', () => {
    const result = metaDescription('Материалы: https://disk.yandex.ru/d/SECRET-id и конспект http://example.com/a?b=1.')
    expect(result).toBe('Материалы: и конспект')
    expect(result).not.toContain('disk.yandex')
  })
})

describe('заголовок с контекстом', () => {
  it('урок с одинаковым названием отличается курсом', () => {
    expect(titleWithContext('Урок 8', 'Telegram-бот Developer')).toBe('Урок 8 · Telegram-бот Developer')
  })

  it('без курса остаётся название урока', () => {
    expect(titleWithContext('Урок 8', null)).toBe('Урок 8')
  })
})

describe('общие метаданные платформы', () => {
  it('явно перечисляют SVG-иконку: иначе поле icons отключает app/icon.svg', () => {
    const icons = ROOT_METADATA.icons as { icon: { url: string }[]; apple: { url: string }[] }
    expect(icons.icon.map((icon) => icon.url)).toContain('/icon.svg')
    expect(icons.apple.map((icon) => icon.url)).toContain('/images/pwa/icon-192.png')
  })

  it('картинка превью лежит под /images, который middleware отдаёт без входа', () => {
    expect(OG_IMAGE.url.startsWith('/images/')).toBe(true)
    expect(ROOT_METADATA.metadataBase).toBeInstanceOf(URL)
  })
})
