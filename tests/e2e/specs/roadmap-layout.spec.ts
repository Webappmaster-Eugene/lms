import { expect, test, type Locator } from '@playwright/test'
import { storageStateOf } from '../fixtures/env'

async function assertGeometry(canvas: Locator) {
  await expect(canvas).toHaveAttribute('data-layout-ready', 'true')
  const failures = await canvas.evaluate((element) => {
    const cards = Array.from(element.querySelectorAll('.react-flow__node:not(.react-flow__node-annotation)')).map((node) => ({ id: node.getAttribute('data-id'), rect: node.getBoundingClientRect() }))
    const overlaps: string[] = []
    for (let first = 0; first < cards.length; first++) for (let second = first + 1; second < cards.length; second++) {
      const a = cards[first].rect, b = cards[second].rect
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${cards[first].id}/${cards[second].id}`)
    }
    const hits: string[] = []
    for (const path of element.querySelectorAll<SVGPathElement>('.react-flow__edge-path')) {
      const length = path.getTotalLength(), matrix = path.getScreenCTM()
      if (!matrix) continue
      for (let distance = 10; distance < length - 10; distance += 4) {
        const point = path.getPointAtLength(distance).matrixTransform(matrix)
        const hit = cards.find((card) => point.x > card.rect.left + 1 && point.x < card.rect.right - 1 && point.y > card.rect.top + 1 && point.y < card.rect.bottom - 1)
        if (hit) { hits.push(`${path.closest('.react-flow__edge')?.getAttribute('data-id')}/${hit.id}`); break }
      }
    }
    return { overlaps, hits }
  })
  expect(failures.overlaps).toEqual([])
  expect(failures.hits).toEqual([])
}

test.describe('Аккуратная геометрия роадмапа', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('измеряет большую карту, разводит карточки и длинные связи в обеих темах', async ({ page }, testInfo) => {
    const key = `layout-regression-${Date.now()}`
    const nodes: number[] = [], edges: number[] = []
    let roadmapId: number | undefined
    async function create(collection: string, data: Record<string, unknown>) {
      const response = await page.request.post(`/api/${collection}`, { data })
      expect(response.status()).toBe(201)
      return (await response.json()).doc as { id: number }
    }
    try {
      const roadmap = await create('roadmaps', { title: 'Большая учебная карта', slug: key, isPublished: true })
      roadmapId = roadmap.id
      const start = await create('roadmap-nodes', { roadmap: roadmap.id, nodeId: `${key}-start`, nodeType: 'category', label: 'Начало обучения', stage: 'start', positionX: 400, positionY: 0 })
      nodes.push(start.id)
      for (let index = 0; index < 24; index++) {
        const row = Math.floor(index / 4)
        const node = await create('roadmap-nodes', {
          roadmap: roadmap.id, nodeId: `${key}-${index}`, nodeType: 'topic', label: `Тема ${index + 1}: проверяем архитектуру`,
          stage: ['base', 'stage1', 'stage2', 'practice', 'advanced', 'growth'][row],
          positionX: (index % 4) * 170, positionY: 150 + row * 160,
          bullets: Array.from({ length: index % 7 }, (_, point) => ({ text: `Практическая задача ${point + 1}: подробно разберите данные, зависимости и варианты поведения системы` })),
        })
        nodes.push(node.id)
        const source = index < 4 ? start.id : nodes[index - 3]
        edges.push((await create('roadmap-edges', { roadmap: roadmap.id, edgeId: `${key}-edge-${index}`, source, target: node.id, edgeType: 'smoothstep' })).id)
      }
      edges.push((await create('roadmap-edges', { roadmap: roadmap.id, edgeId: `${key}-long`, source: nodes[1], target: nodes[22] })).id)
      await page.goto(`/roadmaps/${key}`)
      const canvas = page.locator('[data-roadmap-canvas]')
      for (const theme of ['dark', 'light']) {
        await page.evaluate((value) => { document.documentElement.classList.toggle('dark', value === 'dark') }, theme)
        await assertGeometry(canvas)
        await expect(canvas.locator('.react-flow__node:not(.react-flow__node-annotation)')).toHaveCount(25)
      }
      await canvas.getByRole('button', { name: 'Обзор карты', exact: true }).click()
      await page.screenshot({ path: testInfo.outputPath('large-roadmap.png') })
      await canvas.getByRole('combobox', { name: 'Перейти к этапу' }).selectOption('advanced')
      await canvas.getByLabel('Найти тему или курс на карте').fill('Тема 17:')
      await canvas.getByLabel('Найти тему или курс на карте').press('Enter')
      await expect(canvas.getByRole('heading', { name: 'Тема 17: проверяем архитектуру', exact: true })).toBeVisible()
      await canvas.getByRole('button', { name: 'Закрыть панель темы' }).click()
      const topic = canvas.getByRole('button', { name: 'Открыть тему «Тема 17: проверяем архитектуру»', exact: true })
      await topic.focus()
      await topic.press('Enter')
      await expect(canvas.getByRole('heading', { name: 'Тема 17: проверяем архитектуру', exact: true })).toBeVisible()
      await canvas.getByRole('button', { name: 'Закрыть панель темы' }).click()
      await canvas.getByRole('button', { name: 'Во весь экран', exact: true }).click()
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute('data-roadmap-canvas') ?? false)).toBe(true)
      await canvas.getByRole('button', { name: 'Выйти из полного экрана', exact: true }).click()
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
    } finally {
      for (const id of edges.reverse()) await page.request.delete(`/api/roadmap-edges/${id}`)
      for (const id of nodes.reverse()) await page.request.delete(`/api/roadmap-nodes/${id}`)
      if (roadmapId) await page.request.delete(`/api/roadmaps/${roadmapId}`)
    }
  })
})
