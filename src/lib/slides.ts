import { VIDEO_EXTENSION } from '@/lib/lesson-video-source'
import { parsePublicResourceUrl } from '@/lib/yandex-disk-url'

export const SLIDES_LIMIT = 300

export type SlideKind = 'image' | 'pdf' | 'file'
export type SlideItem = { id?: string | null; url: string; fileName?: string | null; caption?: string | null }

const MEDIA_PREFIX = '/api/media/file/'
// Только форматы, которые прокси отдаёт с типом картинки: SVG исполняет скрипты, HEIC браузеры не рисуют.
const IMAGE_NAME = /\.(?:png|jpe?g|gif|webp)$/i
const FILE_NAME = /\.[a-z\d]{1,12}$/i

/** Адрес файла медиатеки внутри платформы. Чужой сайт с похожим путём сюда не подходит. */
function mediaFileName(url: string): string | null {
  if (!url.startsWith(MEDIA_PREFIX)) return null
  const name = url.slice(MEDIA_PREFIX.length)
  if (!name || /[/\\?#]/.test(name)) return null
  try {
    return decodeURIComponent(name)
  } catch {
    return null
  }
}

/**
 * Адрес загруженного файла. Скобки и апостроф кодируются: индекс файлов урока
 * обрывает адрес на них, и ученик не получил бы файл «Снимок экрана (1).png».
 */
export function mediaFileUrl(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${MEDIA_PREFIX}${encoded}`
}

/**
 * Имя файла из адреса источника. Ученик получает внутренний адрес без имени, поэтому оно хранится рядом.
 * У ссылки на отдельный файл Диска (`/i/…`) имени в адресе нет — его узнаёт сервер при сохранении.
 */
export function slideFileName(url: string): string | null {
  const ref = parsePublicResourceUrl(url)
  return ref ? ref.path?.split('/').at(-1) || null : mediaFileName(url)
}

export function slideKind(fileName: string | null | undefined): SlideKind {
  if (!fileName) return 'file'
  if (IMAGE_NAME.test(fileName)) return 'image'
  return /\.pdf$/i.test(fileName) ? 'pdf' : 'file'
}

/** «Слайд 2» раньше «Слайд 10»: имена сравниваются с учётом чисел, как в проводнике. */
export function compareSlideNames(left: string, right: string): number {
  return left.localeCompare(right, 'ru', { numeric: true, sensitivity: 'base' }) || left.localeCompare(right)
}

export function slideNameProblem(fileName: string): string | null {
  if (!FILE_NAME.test(fileName)) return 'у файла нет расширения'
  return VIDEO_EXTENSION.test(fileName) ? 'видео добавляйте блоком «Видео»' : null
}

// Разбор URL молча выбрасывает табуляцию и переводы строк: адрес с ними прошёл бы проверку,
// но не совпал бы сам с собой при выдаче ученику.
const hasHiddenCharacters = (url: string): boolean => /\s/.test(url) || [...url].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)

/** Почему адрес нельзя положить в презентацию; null — адрес подходит. */
export function slideUrlProblem(url: string): string | null {
  if (hasHiddenCharacters(url)) return 'в ссылке не должно быть пробелов и переводов строк'
  const ref = parsePublicResourceUrl(url)
  if (!ref && mediaFileName(url) === null) return 'нужна ссылка на файл на Яндекс Диске или в медиатеке'
  const name = slideFileName(url)
  // Имя без расширения на Диске — обычно подпапка: подсказываем, куда её вставить.
  if (name && ref && !FILE_NAME.test(name)) return 'у файла нет расширения — если это папка, вставьте ссылку в поле «Папка на Яндекс Диске»'
  if (name) return slideNameProblem(name)
  // Папку ученику не отдаём: её файлы должны стоять в списке по одному.
  return ref && new URL(ref.publicKey).pathname.startsWith('/i/') ? null : 'это ссылка на папку — вставьте её в поле «Папка на Яндекс Диске»'
}

/** Почему адрес не годится в поле папки; null — адрес подходит. */
export function slideFolderProblem(url: string): string | null {
  if (hasHiddenCharacters(url)) return 'в ссылке не должно быть пробелов и переводов строк'
  const ref = parsePublicResourceUrl(url)
  if (!ref) return 'нужна публичная ссылка Яндекс Диска вида https://disk.yandex.ru/d/…'
  return new URL(ref.publicKey).pathname.startsWith('/i/') ? 'это ссылка на отдельный файл — добавьте её в список файлов' : null
}

/** Лежит ли файл прямо в этой папке Диска: обновление списка из папки убирает только такие. */
export function isInSlideFolder(fileUrl: string, folderUrl: string): boolean {
  const file = parsePublicResourceUrl(fileUrl)
  const folder = parsePublicResourceUrl(folderUrl)
  if (!file?.path || !folder || file.publicKey !== folder.publicKey) return false
  const parent = file.path.slice(0, file.path.lastIndexOf('/'))
  return parent === (folder.path ?? '').replace(/\/+$/, '')
}

/** Адрес, по которому файл откроет браузер: у администратора в блоке лежит исходная ссылка Диска. */
export function slideSourceUrl(url: string): string {
  return parsePublicResourceUrl(url) ? `/api/learning-assets?${new URLSearchParams({ url })}` : url
}
