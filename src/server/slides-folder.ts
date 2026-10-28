// Без 'server-only': модуль загружает конфиг Payload, а его читает и CLI миграций вне Next.
import { APIError } from 'payload'

import { compareSlideNames, slideFolderProblem, slideNameProblem, SLIDES_LIMIT } from '@/lib/slides'
import {
  buildPublicFileUrl, fetchPublicFolderContents, fetchPublicResourceMeta, parsePublicResourceUrl, YandexDiskError,
} from '@/lib/yandex-disk'

/** Ошибка, текст которой написан для администратора и показывается ему как есть. */
export class SlidesError extends APIError {
  constructor(message: string) {
    super(message, 400, undefined, true)
  }
}

export type SlideFolderFile = { url: string; fileName: string }

// Служебные файлы macOS, Windows и офисных редакторов попадают в папку сами и слайдами не являются.
const SERVICE_FILE = /^(?:\.|~\$|thumbs\.db$|desktop\.ini$)/i

const DISK_DEADLINE_MS = 20_000

const diskToken = () => process.env.YANDEX_DISK_TOKEN || undefined

/**
 * Сохранение урока держит блокировку его строки, пока хук читает Диск.
 * Без предела по времени зависший Диск остановил бы и прогресс, и заметки учеников по этому уроку.
 */
async function withinDeadline<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Disk deadline exceeded')), DISK_DEADLINE_MS) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function diskProblem(error: unknown): string {
  if (error instanceof YandexDiskError && [403, 404].includes(error.statusCode)) {
    return 'Яндекс Диск не открыл ссылку. Проверьте, что она публичная и ведёт на существующую папку или файл'
  }
  return 'Не удалось прочитать Яндекс Диск. Повторите попытку позже'
}

/** Файлы папки в том порядке, в каком их покажет презентация. Подпапки не читаются: папка — одна презентация. */
export async function listSlideFolder(folderUrl: string): Promise<SlideFolderFile[]> {
  const problem = slideFolderProblem(folderUrl.trim())
  const ref = parsePublicResourceUrl(folderUrl.trim())
  if (problem || !ref) throw new SlidesError(`Папка: ${problem ?? 'нужна публичная ссылка Яндекс Диска'}`)
  let entries
  try {
    entries = await withinDeadline(fetchPublicFolderContents(ref.publicKey, { path: ref.path ?? undefined, token: diskToken() }))
  } catch (error) {
    throw new SlidesError(diskProblem(error))
  }
  const files: SlideFolderFile[] = []
  for (const entry of entries) {
    if (entry.type !== 'file' || SERVICE_FILE.test(entry.name) || slideNameProblem(entry.name)) continue
    const url = buildPublicFileUrl(ref.publicKey, entry.path)
    if (url) files.push({ url, fileName: entry.name })
  }
  if (!files.length) {
    throw new SlidesError('В папке на Яндекс Диске нет картинок, PDF и других файлов для презентации. Подпапки и видео не учитываются')
  }
  if (files.length > SLIDES_LIMIT) {
    throw new SlidesError(`Файлов в папке: ${files.length}. В одной презентации помещается не больше ${SLIDES_LIMIT} - разделите папку на части`)
  }
  return files.sort((left, right) => compareSlideNames(left.fileName, right.fileName))
}

/** Имя файла по ссылке на отдельный файл Диска: в самой ссылке его нет. */
export async function resolveSlideFileName(url: string): Promise<string> {
  const ref = parsePublicResourceUrl(url)
  if (!ref) throw new SlidesError('Нужна ссылка на файл на Яндекс Диске или в медиатеке')
  let meta
  try {
    meta = await withinDeadline(fetchPublicResourceMeta(ref, { token: diskToken() }))
  } catch (error) {
    throw new SlidesError(diskProblem(error))
  }
  if (meta.type !== 'file') throw new SlidesError('Это ссылка на папку - вставьте её в поле «Папка на Яндекс Диске»')
  return meta.name
}
