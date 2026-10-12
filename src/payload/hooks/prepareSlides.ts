import type { CollectionBeforeChangeHook } from 'payload'

import { slideFileName, slideFolderProblem, slideNameProblem, slideUrlProblem, SLIDES_LIMIT } from '@/lib/slides'
import type { Lesson } from '@/payload-types'
import { listSlideFolder, resolveSlideFileName, SlidesError } from '@/server/slides-folder'

type Block = NonNullable<Lesson['content']>[number]
type SlidesBlock = Extract<Block, { blockType: 'slides' }>
type Item = NonNullable<SlidesBlock['items']>[number]

async function prepareBlock(block: SlidesBlock, knownNames: Map<string, string>): Promise<SlidesBlock> {
  const label = `Презентация «${block.title?.trim() || 'без названия'}»`
  const folderUrl = block.folderUrl?.trim() || null
  // Поле папки проверяется и при заполненном списке: файл или адрес медиатеки в нём
  // попал бы в индекс файлов урока, хотя в презентации его нет.
  const folderProblem = folderUrl ? slideFolderProblem(folderUrl) : null
  if (folderProblem) throw new SlidesError(`${label}, папка: ${folderProblem}`)
  let items: Item[] = (block.items ?? []).map((item) => ({ ...item, url: (item.url ?? '').trim() }))
  if (!items.length && folderUrl) items = (await listSlideFolder(folderUrl)).map((file) => ({ url: file.url, fileName: file.fileName }))
  if (!items.length) throw new SlidesError(`${label}: добавьте файлы или ссылку на папку Яндекс Диска`)
  if (items.length > SLIDES_LIMIT) throw new SlidesError(`${label}: не более ${SLIDES_LIMIT} файлов`)
  const prepared: Item[] = []
  for (const [index, item] of items.entries()) {
    const place = `${label}, файл ${index + 1}`
    const problem = slideUrlProblem(item.url)
    if (problem) throw new SlidesError(`${place}: ${problem}`)
    // Имя берётся из адреса или с Диска, а не из запроса: по нему плеер решает, картинка это или PDF.
    const fileName = slideFileName(item.url) ?? knownNames.get(item.url) ?? await resolveSlideFileName(item.url)
    const nameProblem = slideNameProblem(fileName)
    if (nameProblem) throw new SlidesError(`${place}: ${nameProblem}`)
    prepared.push({ ...item, fileName, caption: item.caption?.trim() || null })
  }
  return { ...block, folderUrl, items: prepared }
}

/** Заполняет презентацию файлами папки и проверяет, что каждый файл можно отдать ученику. */
export const prepareSlides: CollectionBeforeChangeHook<Lesson> = async ({ data, originalDoc }) => {
  const content = data?.content
  if (!Array.isArray(content) || !content.some((block) => block.blockType === 'slides')) return data
  const knownNames = new Map<string, string>()
  for (const block of originalDoc?.content ?? []) {
    if (block.blockType !== 'slides') continue
    for (const item of block.items ?? []) if (item.fileName) knownNames.set(item.url, item.fileName)
  }
  const prepared: Block[] = []
  for (const block of content) prepared.push(block.blockType === 'slides' ? await prepareBlock(block, knownNames) : block)
  return { ...data, content: prepared }
}
