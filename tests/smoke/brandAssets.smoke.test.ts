import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

const file = (path: string) => readFileSync(path)

/** Записи ICO: размер и тип содержимого. Браузеры берут отсюда значок и для вкладки, и для закладок. */
function icoSizes(path: string) {
  const data = file(path)
  return Array.from({ length: data.readUInt16LE(4) }, (_, index) => data.readUInt8(6 + 16 * index))
}

describe('файлы знака', () => {
  it('лендинг использует те же контуры, что и платформа', () => {
    expect(file('landing/src/data/brand-mark.ts').toString()).toBe(file('src/lib/brand-mark.ts').toString())
  })

  it.each([
    ['public/images/pwa/icon-32.png', 32],
    ['public/images/pwa/icon-192.png', 192],
    ['public/images/pwa/icon-512.png', 512],
    ['public/images/pwa/maskable-512.png', 512],
    ['public/images/pwa/apple-touch-icon.png', 180],
    ['public/images/pwa/badge-96.png', 96],
    ['landing/public/favicon-32.png', 32],
    ['landing/public/apple-touch-icon.png', 180],
    ['landing/public/logo.png', 512],
  ])('%s: %i px', async (path, size) => {
    const { width, height, format } = await sharp(path).metadata()
    expect({ width, height, format }).toEqual({ width: size, height: size, format: 'png' })
  })

  it.each(['src/app/favicon.ico', 'landing/public/favicon.ico'])('%s содержит 16, 32 и 48 px', (path) => {
    expect(icoSizes(path)).toEqual([16, 32, 48])
  })

  it.each(['public/images/og.png', 'landing/public/og.png'])('%s в размере 1200x630', async (path) => {
    const { width, height } = await sharp(path).metadata()
    expect({ width, height }).toEqual({ width: 1200, height: 630 })
  })

  // Прозрачное iOS заливает чёрным, а Android обрезает маской по краю плитки: альфа-канала быть не должно.
  it.each(['public/images/pwa/apple-touch-icon.png', 'public/images/pwa/maskable-512.png', 'landing/public/apple-touch-icon.png'])('%s без альфа-канала', async (path) => {
    expect((await sharp(path).metadata()).hasAlpha).toBe(false)
  })

  it('значок уведомления состоит только из белого знака на прозрачном фоне: Android рисует его по прозрачности', async () => {
    const { data, info } = await sharp('public/images/pwa/badge-96.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(data[info.channels - 1]).toBe(0)
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset + 3] === 255) expect([data[offset], data[offset + 1], data[offset + 2]]).toEqual([255, 255, 255])
    }
  })
})
