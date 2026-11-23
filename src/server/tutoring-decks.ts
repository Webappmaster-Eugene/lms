import 'server-only'

import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { PPTX_MIME, TUTORING_DECK_DIRECTORY, TUTORING_FILE_LIMIT } from '@/lib/tutoring-file-types'
import type { TutoringMeeting, User } from '@/payload-types'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { TutoringProblem } from '@/server/tutoring'

export const TUTORING_REQUEST_LIMIT = 2 * TUTORING_FILE_LIMIT + 512 * 1024

type ImportMaterial = Pick<TutoringMeeting, 'program' | 'number' | 'title' | 'homework' | 'instructorNotes' | 'sourceDigest'>

// Inspect ZIP member names without extracting any data. ZIP64 and spanned archives are
// outside the size limit. Require a normal presentation part and disallow VBA parts.
function isPptx(data: Buffer) {
  if (data.length < 22 || data.readUInt32LE(0) !== 0x04034b50) return false
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0 || end + 22 > data.length || end + 22 + data.readUInt16LE(end + 20) !== data.length ||
    data.readUInt32LE(end + 4) !== 0 || data.readUInt16LE(end + 8) !== data.readUInt16LE(end + 10)) return false
  let offset = data.readUInt32LE(end + 16)
  if (offset + data.readUInt32LE(end + 12) !== end) return false
  const names = new Set<string>()
  for (let i = 0; i < data.readUInt16LE(end + 10); i++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50 || (data.readUInt16LE(offset + 8) & 1) !== 0) return false
    const nameLength = data.readUInt16LE(offset + 28)
    const next = offset + 46 + nameLength + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32)
    if (next > end) return false
    const name = data.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (/vbaProject|vbaData/i.test(name) || names.has(name)) return false
    names.add(name)
    offset = next
  }
  return offset === end && ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide1.xml'].every(name => names.has(name))
}

async function validatedFile(input: FormDataEntryValue | null, format: 'pdf' | 'pptx', label: string) {
  if (!(input instanceof File) || !input.size || input.size > TUTORING_FILE_LIMIT || !input.name.toLowerCase().endsWith(`.${format}`)) {
    throw new TutoringProblem(`Приложите файл .${format} размером до 10 МБ`)
  }
  const data = Buffer.from(await input.arrayBuffer())
  const valid = format === 'pdf'
    ? data.toString('ascii', 0, 5) === '%PDF-' && data.subarray(-1024).includes(Buffer.from('%%EOF'))
    : isPptx(data)
  if (!valid) throw new TutoringProblem(`Файл .${format} повреждён или имеет другой формат`)
  return { data, name: `${label}.${format}`, mimetype: format === 'pdf' ? 'application/pdf' : PPTX_MIME, size: data.length }
}

export async function saveTutoringDeck(payload: Payload, user: User, form: FormData, target:
  { id: number; updatedAt: string; material?: undefined; decksOnly?: undefined } |
  { id: number | null; updatedAt: string; material: ImportMaterial; decksOnly?: boolean },
) {
  const label = `mentorcareer-lecture-${randomUUID()}`
  const [pdf, pptx] = await Promise.all([
    validatedFile(form.get('pdf'), 'pdf', label),
    validatedFile(form.get('pptx'), 'pptx', label),
  ])
  try {
    return await inTransaction(payload, user, async req => {
      const tx = await txDb(req)
      if (target.id) await tx.execute(sql`select id from tutoring_meetings where id = ${target.id} for update`)
      const current = target.id ? await payload.findByID({
        collection: 'tutoring-meetings', id: target.id, req, overrideAccess: true, depth: 0, disableErrors: true,
      }) : null
      if (current && target.material && (current.program !== target.material.program || current.number !== target.material.number)) {
        throw new TutoringProblem('Номер и программа лекции не совпадают')
      }
      if (target.material && current?.deckOrigin === 'manual') return { id: current.id, status: 'manual' as const }
      if (target.material && current?.sourceDigest === target.material.sourceDigest && current?.deckPdf && current.deckPptx) {
        return { id: current.id, status: 'unchanged' as const }
      }
      if ((target.id && !current) || (current && current.updatedAt !== target.updatedAt)) {
        throw new TutoringProblem('Лекция уже изменилась. Обновите страницу и загрузите файлы снова')
      }
      const pdfDoc = await payload.create({ collection: 'tutoring-deck-files', file: pdf, data: {}, req, overrideAccess: true, depth: 0 })
      const pptxDoc = await payload.create({ collection: 'tutoring-deck-files', file: pptx, data: {}, req, overrideAccess: true, depth: 0 })
      const deckOrigin = target.material ? 'import' as const : 'manual' as const
      const revision = { deckPdf: pdfDoc.id, deckPptx: pptxDoc.id, deckOrigin }
      if (current) {
        const material = target.material && target.decksOnly
          ? { instructorNotes: target.material.instructorNotes, sourceDigest: target.material.sourceDigest }
          : target.material
        const saved = await payload.update({ collection: 'tutoring-meetings', id: current.id, data: { ...material, ...revision }, req, overrideAccess: true, depth: 0 })
        return { id: saved.id, status: 'saved' as const }
      }
      if (!target.material || target.decksOnly) throw new TutoringProblem('Лекция не найдена')
      const saved = await payload.create({ collection: 'tutoring-meetings', data: { ...target.material, ...revision }, req, overrideAccess: true, depth: 0 })
      return { id: saved.id, status: 'saved' as const }
    })
  } catch (error) {
    // Payload writes uploads to disk. Verify the rolled-back rows before removing either candidate.
    const rows = await payload.find({
      collection: 'tutoring-deck-files', where: { filename: { in: [pdf.name, pptx.name] } }, limit: 2,
      overrideAccess: true, depth: 0, select: { filename: true },
    }).catch(() => null)
    if (rows) await Promise.allSettled([pdf, pptx].filter(file => !rows.docs.some(doc => doc.filename === file.name))
      .map(file => unlink(path.resolve(TUTORING_DECK_DIRECTORY, file.name))))
    throw error
  }
}
