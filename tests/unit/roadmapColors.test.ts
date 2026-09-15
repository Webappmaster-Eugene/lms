import { describe, expect, it } from 'vitest'

import {
  COLOR_CLASSES,
  STAGE_ANNOTATIONS,
  STAGE_DEFAULT_COLOR,
  STAGE_LEVELS,
  STATUS_RING,
  getNodeClasses,
  type NodeColor,
  type NodeStage,
} from '@/components/roadmap/stage-colors'
import { getEditorColors, getSelectionOutline } from '@/components/roadmap-editor/editor-colors'
import type { NodeStatus } from '@/components/roadmap/types'

/**
 * Палитра узлов роадмапа: цвет берётся от узла, при его отсутствии — от стадии,
 * и только потом нейтральный. Сбой этой цепочки не падает, а тихо перекрашивает
 * карту навыков.
 */

const STAGES: NodeStage[] = ['start', 'base', 'stage1', 'stage2', 'practice', 'advanced', 'growth']
const COLORS: NodeColor[] = ['yellow', 'lime', 'white', 'gray', 'pink', 'blue', 'red']
const STATUSES: NodeStatus[] = ['locked', 'available', 'in-progress', 'completed']

describe('цвет узла роадмапа', () => {
  describe('разрешение цвета', () => {
    it.each(COLORS)('явный цвет %s побеждает стадию', (color) => {
      const classes = getNodeClasses(color, 'base', 'available')

      expect(classes.bg).toBe(COLOR_CLASSES[color].bg)
    })

    it.each(STAGES)('без цвета берётся цвет стадии %s', (stage) => {
      const classes = getNodeClasses(null, stage, 'available')

      expect(classes.bg).toBe(COLOR_CLASSES[STAGE_DEFAULT_COLOR[stage]].bg)
    })

    it('без цвета и без стадии узел нейтральный, а не пустой', () => {
      const classes = getNodeClasses(null, null, 'available')

      expect(classes.bg).toBe(COLOR_CLASSES.white.bg)
      expect(classes.border).toBe(COLOR_CLASSES.white.border)
    })
  })

  describe('состав ответа', () => {
    it('возвращаются все пять групп классов', () => {
      const classes = getNodeClasses('lime', 'stage1', 'completed')

      for (const key of ['bg', 'border', 'text', 'accent', 'ring'] as const) {
        expect(classes[key], `нет группы ${key}`).toBeTruthy()
      }
    })

    it.each(STATUSES)('статус %s даёт свою обводку', (status) => {
      expect(getNodeClasses('white', null, status).ring).toBe(STATUS_RING[status])
    })

    it('статус не меняет цвет карточки', () => {
      const available = getNodeClasses('pink', null, 'available')
      const completed = getNodeClasses('pink', null, 'completed')

      expect(completed.bg).toBe(available.bg)
      expect(completed.ring).not.toBe(available.ring)
    })
  })

  describe('полнота таблиц', () => {
    it('у каждой стадии есть цвет по умолчанию', () => {
      expect(Object.keys(STAGE_DEFAULT_COLOR).sort()).toEqual([...STAGES].sort())
    })

    it('у каждого цвета заполнены все поля палитры', () => {
      for (const color of COLORS) {
        const palette = COLOR_CLASSES[color]
        expect(palette, `нет палитры для ${color}`).toBeDefined()
        for (const key of ['bg', 'border', 'text', 'accent'] as const) {
          expect(palette[key], `${color}.${key} пустой`).toBeTruthy()
        }
      }
    })

    it('каждый цвет поддержан и в светлой, и в тёмной теме', () => {
      for (const color of COLORS) {
        expect(COLOR_CLASSES[color].bg, `${color} без dark-варианта`).toContain('dark:')
      }
    })

    it('у каждой стадии определён уровень — пусть даже пустой', () => {
      expect(Object.keys(STAGE_LEVELS).sort()).toEqual([...STAGES].sort())
    })

    it('аннотации ссылаются только на существующие стадии', () => {
      for (const annotation of STAGE_ANNOTATIONS) {
        expect(STAGES, `неизвестная стадия ${annotation.stage}`).toContain(annotation.stage)
        expect(annotation.leftLabel.trim().length).toBeGreaterThan(0)
      }
    })
  })
})

describe('цвет узла в редакторе', () => {
  it('повторяет ту же цепочку разрешения, что и просмотр', () => {
    expect(getEditorColors('red', 'base')).toEqual(getEditorColors('red', null))
    expect(getEditorColors(null, 'base')).toEqual(getEditorColors(STAGE_DEFAULT_COLOR.base, null))
  })

  it('без цвета и стадии — нейтральный', () => {
    expect(getEditorColors(null, null)).toEqual(getEditorColors('white', null))
  })

  it.each(COLORS)('цвет %s описан инлайн-стилями, а не классами', (color) => {
    const style = getEditorColors(color, null)

    // В редакторе узлы рисует ReactFlow инлайном — Tailwind-классы туда не доедут.
    expect(style.bg).toMatch(/^(rgba?|#)/)
    expect(style.border).toMatch(/^(rgba?|#)/)
  })

  describe('выделение узла', () => {
    it('выделенный получает обводку', () => {
      expect(getSelectionOutline(true).outline).toBeTruthy()
    })

    it('невыделенный не получает ничего — иначе рамка остаётся висеть', () => {
      expect(getSelectionOutline(false)).toEqual({})
    })
  })
})
