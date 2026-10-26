import { describe, expect, it } from 'vitest'

import { absoluteBroadcastUrl, broadcastCtaUrlError, broadcastPlainText, parseBroadcastBody } from '@/lib/broadcast-markup'

/**
 * Ссылки в тексте рассылки: в письмо ученикам не должна попасть кликабельная
 * ссылка с логином и паролем или битый адрес — такие остаются обычным текстом.
 */

describe('ссылки с учётными данными и битые адреса в тексте рассылки', () => {
  it('ссылка в квадратных скобках с логином и паролем остаётся текстом целиком', () => {
    const [nodes] = parseBroadcastBody('Доступ к [стенду](https://admin:secret@stand.example.test/panel) открыт')

    expect(nodes).toEqual([{ type: 'text', value: 'Доступ к [стенду](https://admin:secret@stand.example.test/panel) открыт' }])
  })

  it('голая ссылка с учётными данными текстом остаётся, а хвостовая точка не теряется', () => {
    const [nodes] = parseBroadcastBody('Репозиторий: https://bot:token@git.example.test/course.git.')

    expect(nodes.some((node) => node.type === 'link')).toBe(false)
    expect(broadcastPlainText(nodes)).toBe('Репозиторий: https://bot:token@git.example.test/course.git.')
  })

  it('адрес, который не разбирается как URL, не становится ссылкой', () => {
    const [nodes] = parseBroadcastBody('Старый адрес https://[учебный-стенд и [вход](https://[::1) больше не работают')

    expect(nodes.some((node) => node.type === 'link')).toBe(false)
    expect(broadcastPlainText(nodes)).toBe('Старый адрес https://[учебный-стенд и [вход](https://[::1) больше не работают')
  })

  it('битый адрес кнопки отклоняется с подсказкой', () => {
    expect(broadcastCtaUrlError('https://[учебный-стенд')).toBe('Укажите ссылку https://… или путь на платформе, например /courses')
  })
})

describe('ссылка кнопки в письме', () => {
  it('путь платформы дополняется адресом сайта без двойной косой черты, внешняя ссылка не меняется', () => {
    expect(absoluteBroadcastUrl('/courses/node', 'https://learn.mentorcareer.ru/')).toBe('https://learn.mentorcareer.ru/courses/node')
    expect(absoluteBroadcastUrl('https://t.me/mentorcareer', 'https://learn.mentorcareer.ru')).toBe('https://t.me/mentorcareer')
  })

  it('слишком длинная или нестроковая ссылка кнопки отклоняется', () => {
    expect(broadcastCtaUrlError(`https://learn.mentorcareer.ru/${'a'.repeat(2000)}`)).toBe('Ссылка кнопки слишком длинная')
    expect(broadcastCtaUrlError(42)).not.toBeNull()
  })
})
