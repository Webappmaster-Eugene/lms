/**
 * Собирает файлы знака из контуров в src/lib/brand-mark.ts. Запускать после правки контуров:
 * pnpm brand:generate. Картинки для соцсетей рисует scripts/brand/og.ts.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { BRAND_COLORS as C, BRAND_TILE_RADIUS, MARK_LARGE, MARK_SMALL, type BrandCut } from '../../src/lib/brand-mark'

type Tile = { cut: BrandCut; radius: number; scale?: number; size: number }

function tile({ cut, radius, scale = 1, size }: Tile): string {
  const shift = (1 - scale) * 256
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><rect width="512" height="512" rx="${radius}" fill="${C.deep}"/><g transform="translate(${shift} ${shift}) scale(${scale})"><path d="${cut.oars.join('')}" fill="${C.sail}"/><path d="${cut.bow}" fill="${C.sun}"/></g></svg>`
}

// Рисуем сразу в итоговом размере: уменьшение большого снимка размывает вертикали на 16 px.
const png = (svg: string) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()

/** ICO с PNG внутри: 6 байт заголовка, по 16 на запись, затем сами картинки. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index
    header.writeUInt8(size, entry)
    header.writeUInt8(size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...images.map(({ data }) => data)])
}

const small = (size: number) => png(tile({ cut: MARK_SMALL, radius: BRAND_TILE_RADIUS.small, size }))
const large = (size: number) => png(tile({ cut: MARK_LARGE, radius: BRAND_TILE_RADIUS.large, size }))
// Android вписывает маскируемую иконку в круг радиусом 40%, iOS сам скругляет и заливает прозрачное чёрным.
const fullBleed = (size: number, scale: number) => sharp(Buffer.from(tile({ cut: MARK_LARGE, radius: 0, scale, size }))).removeAlpha().png({ compressionLevel: 9 }).toBuffer()
// Значок уведомления Android рисует только по прозрачности: плитка стала бы белым квадратом.
const badge = (size: number) => png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><path d="${MARK_SMALL.oars.join('')}${MARK_SMALL.bow}" fill="#fff"/></svg>`)

async function favicon() {
  return ico(await Promise.all([{ size: 16, data: await small(16) }, { size: 32, data: await small(32) }, { size: 48, data: await large(48) }]))
}

function write(file: string, data: Buffer) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, data)
  process.stdout.write(`${file} ${data.length} байт\n`)
}

const files: Record<string, Buffer> = {
  'public/images/pwa/icon-32.png': await small(32),
  'public/images/pwa/icon-192.png': await large(192),
  'public/images/pwa/icon-512.png': await large(512),
  'public/images/pwa/maskable-512.png': await fullBleed(512, 0.9),
  'public/images/pwa/apple-touch-icon.png': await fullBleed(180, 1),
  'public/images/pwa/badge-96.png': await badge(96),
  'src/app/favicon.ico': await favicon(),
  'landing/public/favicon.ico': await favicon(),
  'landing/public/favicon-32.png': await small(32),
  'landing/public/apple-touch-icon.png': await fullBleed(180, 1),
  'landing/public/logo.png': await fullBleed(512, 1),
}
for (const [file, data] of Object.entries(files)) write(file, data)
copyFileSync('src/lib/brand-mark.ts', 'landing/src/data/brand-mark.ts')
