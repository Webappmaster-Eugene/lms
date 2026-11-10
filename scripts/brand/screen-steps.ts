/** Метки шагов на снимках лендинга: точка на элементе в процентах от кадра и запись координат в файл с шагами. */
import type { Locator, Page } from '@playwright/test'

export type Point = { x: number; y: number }

/** Где стоит метка: в центре элемента, у его правого края или слева от него, чтобы не закрыть надпись. */
export type Place = 'center' | 'end' | 'before'

// Метка на лендинге 32 px, кадр 1440 px показан шириной около 1120 px: на снимке это около 40 px.
const EDGE = { end: -28, before: -24 } as const

export async function markPoint(page: Page, target: Locator, width: number, height: number, place: Place = 'center'): Promise<Point> {
  const box = await target.boundingBox()
  if (!box) throw new Error(`Нет элемента для метки на ${page.url()}: ${target}`)
  const x = place === 'end' ? box.x + box.width + EDGE.end : place === 'before' ? box.x + EDGE.before : box.x + box.width / 2
  const round = (value: number) => Math.round(value * 100) / 100
  return { x: round((x / width) * 100), y: round(((box.y + box.height / 2) / height) * 100) }
}

/** Координаты живут рядом с текстом шагов: заменяем их по порядку внутри главы снимка. */
export function patchSteps(source: string, hotspots: Record<string, Point[]>, file: string): string {
  let result = source
  for (const [name, points] of Object.entries(hotspots)) {
    const start = result.indexOf(`screen: '${name}'`)
    const stepsStart = result.indexOf('steps: [', start)
    const stepsEnd = result.indexOf('\n    ],', stepsStart)
    if (start < 0 || stepsStart < 0 || stepsEnd < 0) throw new Error(`В ${file} нет шагов снимка ${name}`)
    let index = 0
    const steps = result.slice(stepsStart, stepsEnd).replace(/x: [\d.]+, y: [\d.]+/g, () => {
      const point = points[index++]
      if (!point) throw new Error(`У снимка ${name} меток меньше, чем шагов`)
      return `x: ${point.x}, y: ${point.y}`
    })
    if (index !== points.length) throw new Error(`У снимка ${name} ${points.length} меток, а шагов ${index}`)
    result = result.slice(0, stepsStart) + steps + result.slice(stepsEnd)
  }
  return result
}
