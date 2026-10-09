import { describe, expect, it } from 'vitest'
import { boundedQueryText, positiveQueryInteger, queryHref, shareableURL, sharedPlaybackRate, sharedVideoId } from '@/lib/shared-url'

const origin = 'https://learn.mentorcareer.ru'
describe('общие ссылки на обучение', () => {
  it('оставляет настройки каталога, исключая секреты и возможности API', () => {
    const url = new URL(shareableURL('/courses?q=node&assigned=1&page=2&sort=title&password=secret&token=private&code=solution&url=https%3A%2F%2Fdisk.yandex.ru%2Fd%2Fprivate', origin))
    expect([...url.searchParams.keys()]).toEqual(['q', 'assigned', 'sort', 'page'])
    expect(url.searchParams.get('q')).toBe('node')
  })
  it('ссылка на фрагмент включает только opaque video ID, время и поддержанную скорость', () => {
    expect(shareableURL('/lessons/node?video=recording:ab12&t=373&rate=1.5&sourceToken=secret#original', origin)).toBe(`${origin}/lessons/node?video=recording%3Aab12&t=373&rate=1.5`)
  })
  it.each(['/api/lesson-assets/file?token=secret', '/reset-password?token=secret', '/admin', 'https://evil.example/courses'])('не выдаёт чувствительную или чужую ссылку %s', (href) => {
    expect(() => shareableURL(href, origin)).toThrow()
  })
  it('не копирует ссылку на исходник, спрятанную внутри разрешённого q', () => {
    expect(shareableURL('/courses?q=https://disk.yandex.ru/d/private', origin)).toBe(`${origin}/courses`)
  })
  it('ограничивает строки и числа', () => {
    expect(boundedQueryText('ab\ncd'.repeat(100))).toHaveLength(160)
    expect(positiveQueryInteger('Infinity')).toBe(1)
    expect(positiveQueryInteger('999999999999999')).toBe(1)
    expect(sharedVideoId('https://disk.yandex.ru/d/private')).toBeNull()
    expect(sharedPlaybackRate('99')).toBeNull()
  })
  it('при смене фильтра сохраняет несвязанные параметры', () => {
    expect(queryHref('/courses', 'page=2&keep=ok', { page: null, q: 'node' })).toBe('/courses?keep=ok&q=node')
  })
  it('ссылка на задачу сохраняет язык по реальному пути тема/задача', () => {
    expect(shareableURL('/trainer/functions/sum?lang=ts&code=private', origin)).toBe(`${origin}/trainer/functions/sum?lang=ts`)
  })
})
