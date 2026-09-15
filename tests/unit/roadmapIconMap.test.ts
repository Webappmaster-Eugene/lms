import { describe, expect, it } from 'vitest'

import { getIconComponent } from '@/components/roadmap/icon-map'

/**
 * Имена иконок узлов задаются в CMS строкой, поэтому опечатка обязана давать
 * запасную иконку, а не падение рендера всей карты навыков.
 */

const KNOWN = ['database', 'server', 'globe', 'shield', 'rocket', 'zap']

describe('иконка узла роадмапа по имени', () => {
  it.each(KNOWN)('известное имя %s отдаёт компонент', (name) => {
    expect(typeof getIconComponent(name)).toBe('object')
  })

  it('разные имена дают разные иконки', () => {
    expect(getIconComponent('database')).not.toBe(getIconComponent('server'))
  })

  it('одно и то же имя даёт стабильную ссылку — иначе React перемонтирует узел', () => {
    expect(getIconComponent('database')).toBe(getIconComponent('database'))
  })

  describe('запасная иконка', () => {
    it.each([null, '', 'неизвестное-имя', 'DataBase', ' database '])(
      'имя %j подменяется запасной',
      (name) => {
        expect(getIconComponent(name as string | null)).toBe(getIconComponent(null))
      },
    )

    it('запасная иконка — тоже валидный компонент', () => {
      expect(getIconComponent(null)).toBeTruthy()
    })
  })
})
