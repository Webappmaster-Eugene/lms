/**
 * Парсер структуры курса из дерева публичной папки Яндекс.Диска.
 *
 * В отличие от плоской конвенции "X.Y - Название" (см. yandex-disk-parser.ts),
 * здесь структура берётся из самих папок: реальные курсы раскладывают по
 * "Блок N — Название", а нумерация уроков живёт в именах файлов ("1.mp4",
 * "5_2.mp4" — урок 5, часть 2).
 *
 * Классификация папки определяется её содержимым, а не глубиной вложенности:
 * - папка с несколькими разными номерами уроков либо с вложенными уроками — секция;
 * - папка с одним номером урока (или единственным видео без номера) — урок;
 * - папка, состоящая из секций, — группа, сама секцией не становится.
 */

import type { YandexDiskItem } from './yandex-disk'

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'])
const TEXT_EXTENSIONS = new Set(['txt', 'md'])

/** Суффикс папки-наложения с дополнительными материалами: "Курс (доп)". */
const OVERLAY_SUFFIX = /^(.+?)\s*\((?:доп|доп\.|дополнительно|материалы)\)$/i

/** Технические пометки раздач, которые не должны попадать в названия уроков. */
const NOISE_TAGS = /\s*[[(](?:[a-z0-9-]+\.[a-z]{2,}|skladchik[^\])]*)[\])]/gi

export type ImportedVideo = {
  title: string
  /** Путь внутри публичной папки. */
  path: string
  /** Номер части урока; null — урок из одного файла. */
  part: number | null
}

export type ImportedMaterial = {
  title: string
  path: string
  /** Текстовые файлы разворачиваются в ссылки внутри урока, остальные — вложением. */
  isText: boolean
  /** Размер файла нужен, чтобы отличить копию материала из папки-наложения от другого файла. */
  size: number | null
}

export type ImportedLesson = {
  /** Порядок урока внутри секции. */
  order: number
  title: string
  videos: ImportedVideo[]
  materials: ImportedMaterial[]
  /** Название вида "Урок N" сгенерировано из нумерации и пересчитывается вместе с порядком. */
  hasGeneratedTitle: boolean
}

export type ImportedSection = {
  order: number
  title: string
  lessons: ImportedLesson[]
}

export type StructureResult = {
  sections: ImportedSection[]
  warnings: string[]
  totalVideos: number
  totalMaterials: number
}

type TreeNode = {
  name: string
  path: string
  dirs: TreeNode[]
  files: YandexDiskItem[]
}

type NodeKind = 'group' | 'multi' | 'section' | 'lesson' | 'materials'

/**
 * Разобранная нумерация из имени файла или папки.
 * Разделитель различает две конвенции: "5_2" — части одного урока,
 * "1.2" — урок 2 раздела 1.
 */
type UnitRef = {
  number: number
  part: number | null
  separator: '.' | '_' | '-' | null
  label: string
  isDate: boolean
}

export function parseYandexDiskTree(
  items: YandexDiskItem[],
  options: { rootTitle?: string; basePath?: string | null } = {},
): StructureResult {
  const warnings: string[] = []
  const root = buildTree(items, options.basePath ?? null)
  const sections: ImportedSection[] = []

  // Папка "Курс (доп)" не отдельная секция, а материалы к одноимённой основной.
  const overlays = new Map<string, TreeNode>()
  for (const dir of root.dirs) {
    const base = OVERLAY_SUFFIX.exec(dir.name)?.[1]
    if (base && root.dirs.some((sibling) => sibling.name === base)) {
      overlays.set(base, dir)
    }
  }
  const overlayPaths = new Set([...overlays.values()].map((dir) => dir.path))

  // Файлы в корне импортируемой папки разбираются отдельно от её подпапок:
  // подпапки — это самостоятельные секции, а не уроки корневой секции.
  if (root.files.some(isVideo)) {
    const rootFiles: TreeNode = { ...root, dirs: [] }
    const title = options.rootTitle ?? 'Материалы курса'

    if (computeKind(rootFiles) === 'multi') {
      sections.push(...buildDottedSections(rootFiles, warnings))
    } else {
      sections.push(buildSection(rootFiles, title, warnings))
    }
  }

  for (const dir of root.dirs) {
    if (overlayPaths.has(dir.path)) continue
    collectSections(dir, sections, warnings)
  }

  for (const [baseName, overlayDir] of overlays) {
    const baseDir = root.dirs.find((dir) => dir.name === baseName)
    if (!baseDir) continue
    applyOverlay(overlayDir, baseDir, sections, warnings)
  }

  sections.forEach((section, index) => {
    section.order = index + 1
    section.lessons.sort((a, b) => a.order - b.order)
    section.lessons.forEach((lesson, lessonIndex) => {
      lesson.order = lessonIndex + 1
      if (lesson.hasGeneratedTitle) {
        lesson.title = `Урок ${lesson.order}`
      }
      lesson.materials = dedupeMaterials(lesson.materials)
      lesson.videos.sort(compareVideos)
      lesson.videos.forEach((video, videoIndex) => {
        video.title = lesson.videos.length > 1 ? `Часть ${videoIndex + 1}` : lesson.title
      })
    })
  })

  const withLessons = sections.filter((section) => section.lessons.length > 0)
  for (const empty of sections.filter((section) => section.lessons.length === 0)) {
    warnings.push(`Секция "${empty.title}" пропущена: в ней нет ни видео, ни материалов`)
  }
  for (const section of withLessons) {
    if (section.lessons.every((lesson) => lesson.videos.length === 0)) {
      warnings.push(`В секции "${section.title}" нет видео — импортированы только материалы`)
    }
  }
  withLessons.forEach((section, index) => {
    section.order = index + 1
  })

  const totalVideos = withLessons.reduce(
    (sum, section) => sum + section.lessons.reduce((acc, lesson) => acc + lesson.videos.length, 0),
    0,
  )
  const totalMaterials = withLessons.reduce(
    (sum, section) =>
      sum + section.lessons.reduce((acc, lesson) => acc + lesson.materials.length, 0),
    0,
  )

  if (totalVideos === 0) {
    warnings.push('В публичной папке не найдено видео-файлов')
  }

  return { sections: withLessons, warnings, totalVideos, totalMaterials }
}

/**
 * Собирает дерево из плоского рекурсивного листинга.
 * basePath — папка публикации, которую импортируем: она становится корнем дерева.
 */
function buildTree(items: YandexDiskItem[], basePath: string | null): TreeNode {
  const prefix = basePath ? normalizePath(basePath) : ''
  const root: TreeNode = { name: '', path: '/', dirs: [], files: [] }
  const nodes = new Map<string, TreeNode>([['', root]])

  /** Возвращает узел каталога, достраивая недостающих предков. */
  const ensureDir = (dirPath: string): TreeNode => {
    const key = normalizePath(dirPath)
    const existing = nodes.get(key)
    if (existing) return existing

    const segments = key.split('/').filter(Boolean)
    const name = segments[segments.length - 1] ?? ''
    const parent = ensureDir(segments.slice(0, -1).join('/'))
    const node: TreeNode = { name, path: `/${key}`, dirs: [], files: [] }

    parent.dirs.push(node)
    nodes.set(key, node)
    return node
  }

  const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path, 'ru'))

  for (const item of sorted) {
    const relative = stripPrefix(normalizePath(item.path), prefix)
    if (relative === null) continue

    const segments = relative.split('/').filter(Boolean)
    if (segments.length === 0) continue

    if (item.type === 'dir') {
      ensureDir(segments.join('/'))
    } else {
      ensureDir(segments.slice(0, -1).join('/')).files.push(item)
    }
  }

  sortTree(root)
  return root
}

function sortTree(node: TreeNode): void {
  node.dirs.sort(compareNames)
  node.files.sort((a, b) => compareNames({ name: a.name }, { name: b.name }))
  node.dirs.forEach(sortTree)
}

/** Сортировка по ведущему номеру, затем по названию — "2" раньше "10". */
function compareNames(a: { name: string }, b: { name: string }): number {
  const aRef = parseUnitRef(a.name)
  const bRef = parseUnitRef(b.name)

  if (aRef && bRef && aRef.number !== bRef.number) return aRef.number - bRef.number
  if (aRef && !bRef) return -1
  if (!aRef && bRef) return 1

  return a.name.localeCompare(b.name, 'ru')
}

/** Классификация зависит от всего поддерева, поэтому считается один раз на узел. */
const kindCache = new WeakMap<TreeNode, NodeKind>()

function classify(node: TreeNode): NodeKind {
  const cached = kindCache.get(node)
  if (cached) return cached

  const kind = computeKind(node)
  kindCache.set(node, kind)
  return kind
}

function computeKind(node: TreeNode): NodeKind {
  // Папка без единого видео в поддереве — это исходники или раздатка,
  // структуру курса она не задаёт, всё её содержимое идёт материалами.
  if (!hasVideo(node)) return 'materials'

  const childKinds = node.dirs.map(classify).filter((kind) => kind !== 'materials')

  if (childKinds.some((kind) => kind !== 'lesson')) return 'group'
  if (childKinds.length > 0) return 'section'

  // "1.1", "1.2", "2.1" в одной папке — это несколько секций, а не один урок.
  const dotted = dottedRefs(node)
  if (new Set(dotted.map((ref) => ref.number)).size >= 2) return 'multi'

  // Ненумерованный файл — сам по себе урок, поэтому считается наравне с номерами.
  const refs = node.files.filter(isVideo).map((file) => parseUnitRef(file.name))
  const keys = new Set(refs.filter((ref): ref is UnitRef => ref !== null).map(lessonKeyOf))
  const unnumbered = refs.filter((ref) => ref === null).length

  return keys.size + unnumbered >= 2 ? 'section' : 'lesson'
}

/** Есть ли видео в самой папке или где-то внутри неё. */
function hasVideo(node: TreeNode): boolean {
  return node.files.some(isVideo) || node.dirs.some(hasVideo)
}

/** Все файлы поддерева — для папок, которые целиком уходят в материалы. */
function collectFiles(node: TreeNode): YandexDiskItem[] {
  return [...node.files, ...node.dirs.flatMap(collectFiles)]
}

/** Кладёт материалы в первый урок последней секции — ближайший по смыслу. */
function attachMaterials(sections: ImportedSection[], files: YandexDiskItem[], title: string): void {
  if (files.length === 0) return

  const section = sections[sections.length - 1]
  const lesson = section?.lessons[0]

  if (lesson) {
    lesson.materials.push(...files.map(toMaterial))
    return
  }

  sections.push({
    order: 0,
    title,
    lessons: [{
      order: 1, title: 'Материалы', videos: [], hasGeneratedTitle: false,
      materials: files.map(toMaterial),
    }],
  })
}

/** Спускается по дереву, превращая в секции те узлы, что ими являются. */
function collectSections(node: TreeNode, sections: ImportedSection[], warnings: string[]): void {
  const kind = classify(node)

  if (kind === 'materials') {
    attachMaterials(sections, collectFiles(node), cleanTitle(node.name) || 'Материалы')
    return
  }

  if (kind === 'group') {
    // Видео самой папки-группы образуют свою секцию — иначе они потерялись бы.
    if (node.files.some(isVideo)) {
      const ownFiles: TreeNode = { ...node, dirs: [] }
      if (computeKind(ownFiles) === 'multi') {
        sections.push(...buildDottedSections(ownFiles, warnings))
      } else {
        sections.push(buildSection(ownFiles, cleanTitle(node.name), warnings))
      }
    }

    for (const child of node.dirs) {
      collectSections(child, sections, warnings)
    }
    return
  }

  if (kind === 'multi') {
    sections.push(...buildDottedSections(node, warnings))
    return
  }

  if (kind === 'lesson') {
    // Одиночный урок на верхнем уровне — отдельная секция из одного урока.
    const section: ImportedSection = { order: 0, title: cleanTitle(node.name), lessons: [] }
    const lesson = buildLessonFromDir(node, 1)
    if (lesson) section.lessons.push(lesson)
    sections.push(section)
    return
  }

  sections.push(buildSection(node, cleanTitle(node.name), warnings))
}

function buildSection(node: TreeNode, title: string, warnings: string[]): ImportedSection {
  const lessons = new Map<number, ImportedLesson>()

  /** Урок с данным ключом; создаётся при первом обращении. */
  const ensureLesson = (ref: UnitRef): ImportedLesson => {
    const key = lessonKeyOf(ref)
    const existing = lessons.get(key)
    if (existing) return existing

    const label = cleanTitle(ref.label)
    const lesson: ImportedLesson = {
      order: key,
      title: lessonTitle(ref),
      videos: [],
      materials: [],
      hasGeneratedTitle: !ref.isDate && label.length === 0,
    }
    lessons.set(key, lesson)
    return lesson
  }

  const materialDirs = node.dirs.filter((child) => classify(child) === 'materials')

  for (const child of node.dirs.filter((item) => classify(item) !== 'materials')) {
    const ref = parseUnitRef(child.name) ?? {
      number: lessons.size + 1,
      part: null,
      separator: null,
      label: child.name,
      isDate: false,
    }
    const lesson = ensureLesson(ref)
    const nested = buildLessonFromDir(child, lessonKeyOf(ref))

    if (nested) {
      lesson.videos.push(...nested.videos)
      lesson.materials.push(...nested.materials)
      if (!nested.hasGeneratedTitle) {
        lesson.title = nested.title
        lesson.hasGeneratedTitle = false
      }
    }
  }

  const videoFiles = node.files.filter(isVideo)

  // Ключи занумерованных уроков заняты — файлы без нумерации продолжают счёт.
  let nextFreeKey = videoFiles.reduce((max, file) => {
    const ref = parseUnitRef(file.name)
    return ref ? Math.max(max, lessonKeyOf(ref)) : max
  }, 0)

  // Сначала видео — иначе материал с номером может прийти раньше своего урока
  // и осесть в первом попавшемся.
  for (const file of videoFiles) {
    const ref = parseUnitRef(file.name)

    if (ref) {
      ensureLesson(ref).videos.push({ title: '', path: file.path, part: partOf(ref) })
      continue
    }

    // Часть курсов подписывает видео только темой, без номеров: каждый файл — урок.
    const title = cleanTitle(stripExtension(file.name))
    nextFreeKey += 1
    lessons.set(nextFreeKey, {
      order: nextFreeKey,
      title: title.length > 0 ? title : `Урок ${nextFreeKey}`,
      videos: [{ title: '', path: file.path, part: null }],
      materials: [],
      hasGeneratedTitle: title.length === 0,
    })
  }

  const materialFiles = [
    ...node.files.filter((item) => !isVideo(item)),
    ...materialDirs.flatMap(collectFiles),
  ]

  for (const file of materialFiles) {
    const ref = parseUnitRef(file.name)
    const target = ref ? lessons.get(lessonKeyOf(ref)) : undefined

    // Материал без своего урока относится ко всей секции — кладём в первый урок.
    ;(target?.materials ?? sectionMaterials(lessons)).push(toMaterial(file))
  }

  const section: ImportedSection = {
    order: 0,
    title,
    lessons: [...lessons.values()].sort((a, b) => a.order - b.order),
  }

  return section
}

/**
 * Папка, где файлы пронумерованы как "раздел.урок" ("1.1", "1.2", "2.1"):
 * каждый первый номер становится отдельной секцией.
 *
 * Название секции берём из скобок в конце имени — курсы подписывают так
 * раздел целиком ("1.1. Zustand (Введение)"), — иначе нумеруем.
 */
function buildDottedSections(node: TreeNode, warnings: string[]): ImportedSection[] {
  const groups = new Map<number, { files: YandexDiskItem[]; refs: UnitRef[] }>()

  const loose: YandexDiskItem[] = []

  for (const file of node.files.filter(isVideo)) {
    const ref = parseUnitRef(file.name)
    if (!ref || ref.separator !== '.' || ref.part === null) {
      // Файл без нумерации раздела — отдельный урок в конце последней секции.
      loose.push(file)
      continue
    }
    const group = groups.get(ref.number) ?? { files: [], refs: [] }
    group.files.push(file)
    group.refs.push(ref)
    groups.set(ref.number, group)
  }

  const sections: ImportedSection[] = []

  for (const [number, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const suffix = commonSuffix(group.refs)
    const lessons = new Map<number, ImportedLesson>()

    group.refs.forEach((ref, index) => {
      const key = ref.part as number
      const label = cleanTitle(stripSuffix(ref.label, suffix))
      const lesson = lessons.get(key) ?? {
        order: key,
        title: label.length > 0 ? label : `Урок ${key}`,
        videos: [],
        materials: [],
        hasGeneratedTitle: label.length === 0,
      }
      lesson.videos.push({ title: '', path: group.files[index].path, part: null })
      lessons.set(key, lesson)
    })

    sections.push({
      order: number,
      title: suffix ?? `Раздел ${number}`,
      lessons: [...lessons.values()].sort((a, b) => a.order - b.order),
    })
  }

  const lastSection = sections[sections.length - 1]
  if (lastSection) {
    for (const file of loose) {
      const title = cleanTitle(stripExtension(file.name))
      lastSection.lessons.push({
        order: (lastSection.lessons[lastSection.lessons.length - 1]?.order ?? 0) + 1,
        title: title.length > 0 ? title : 'Урок',
        videos: [{ title: '', path: file.path, part: null }],
        materials: [],
        hasGeneratedTitle: false,
      })
    }
  } else if (loose.length > 0) {
    warnings.push(`Файлы без нумерации в папке "${node.name}" пропущены: ${loose.length}`)
  }

  // Материалы такой папки относятся к уроку своего раздела, иначе к первому.
  for (const file of node.files.filter((item) => !isVideo(item))) {
    const ref = parseUnitRef(file.name)
    const section = ref ? sections.find((item) => item.order === ref.number) : undefined
    const target = section ?? sections[0]
    if (!target) continue

    const lesson =
      (ref?.part !== null && ref?.part !== undefined
        ? target.lessons.find((item) => item.order === ref.part)
        : undefined) ?? target.lessons[0]

    if (lesson) lesson.materials.push(toMaterial(file))
  }

  return sections
}

/**
 * Название раздела в скобках: курсы ставят его не у каждого урока, а обычно
 * у первого, поэтому достаточно, чтобы все встреченные варианты совпадали.
 */
function commonSuffix(refs: UnitRef[]): string | null {
  const suffixes = refs
    .map((ref) => /\(([^)]+)\)\s*$/.exec(ref.label)?.[1]?.trim())
    .filter((value): value is string => Boolean(value))

  if (suffixes.length === 0) return null
  return suffixes.every((value) => value === suffixes[0]) ? suffixes[0] : null
}

function stripSuffix(label: string, suffix: string | null): string {
  if (!suffix) return label
  return label.replace(new RegExp(`\\(\\s*${escapeRegExp(suffix)}\\s*\\)\\s*$`), '').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Материалы уровня секции: первый урок секции, либо отдельный урок, если уроков нет. */
function sectionMaterials(lessons: Map<number, ImportedLesson>): ImportedMaterial[] {
  const first = [...lessons.values()].sort((a, b) => a.order - b.order)[0]
  if (first) return first.materials

  const placeholder: ImportedLesson = {
    order: 1,
    title: 'Материалы',
    videos: [],
    materials: [],
    hasGeneratedTitle: false,
  }
  lessons.set(placeholder.order, placeholder)
  return placeholder.materials
}

/** Урок из папки-урока: видео внутри — части одного урока. */
function buildLessonFromDir(node: TreeNode, order: number): ImportedLesson | null {
  const ref = parseUnitRef(node.name)
  const videos: ImportedVideo[] = []
  const materials: ImportedMaterial[] = []

  const collect = (current: TreeNode): void => {
    for (const file of current.files) {
      if (isVideo(file)) {
        const fileRef = parseUnitRef(file.name)
        videos.push({ title: '', path: file.path, part: fileRef ? partOf(fileRef) : null })
      } else {
        materials.push(toMaterial(file))
      }
    }
    current.dirs.forEach(collect)
  }
  collect(node)

  if (videos.length === 0 && materials.length === 0) return null

  const label = ref ? cleanTitle(ref.label) : cleanTitle(node.name)

  return {
    order,
    title: ref ? lessonTitle(ref) : cleanTitle(node.name),
    videos,
    materials,
    hasGeneratedTitle: ref ? !ref.isDate && label.length === 0 : false,
  }
}

/** Переносит файлы папки-наложения в уроки основной структуры. */
function applyOverlay(
  overlayDir: TreeNode,
  baseDir: TreeNode,
  sections: ImportedSection[],
  warnings: string[],
): void {
  const walk = (
    node: TreeNode,
    baseNode: TreeNode | null,
    section: ImportedSection | null,
    lessonNumber: number | null,
  ): void => {
    for (const file of node.files) {
      const target = resolveOverlayTarget(file, section, lessonNumber)
      if (!target) {
        warnings.push(
          `Материал "${file.name}" из папки "${overlayDir.name}" не привязан: нет подходящего урока`,
        )
        continue
      }
      target.materials.push(toMaterial(file))
    }

    for (const child of node.dirs) {
      const nextBase = baseNode?.dirs.find((dir) => dir.name === child.name) ?? null
      const matchedSection = nextBase
        ? sections.find((item) => item.title === cleanTitle(nextBase.name))
        : undefined

      // Папка-урок в основной структуре задаёт урок для всех вложенных материалов.
      const nextLessonNumber = matchedSection
        ? null
        : (nextBase ? parseUnitRef(nextBase.name)?.number ?? lessonNumber : lessonNumber)

      walk(child, nextBase, matchedSection ?? section, nextLessonNumber)
    }
  }

  walk(overlayDir, baseDir, null, null)
}

/**
 * Материал наложения относится к уроку из своей папки-урока; если такой папки
 * не было — к уроку с тем же номером, иначе ко всей секции (первый урок).
 */
function resolveOverlayTarget(
  file: YandexDiskItem,
  section: ImportedSection | null,
  lessonNumber: number | null,
): ImportedLesson | null {
  if (!section) return null

  const number = lessonNumber ?? parseUnitRef(file.name)?.number
  const byNumber =
    number === undefined || number === null
      ? undefined
      : section.lessons.find((lesson) => lesson.order === number)

  return byNumber ?? section.lessons[0] ?? null
}

function toMaterial(file: YandexDiskItem): ImportedMaterial {
  return {
    title: cleanTitle(file.name),
    path: file.path,
    isText: TEXT_EXTENSIONS.has(extensionOf(file.name)),
    size: file.size ?? null,
  }
}

/** Папка-наложение часто дублирует файлы основной: одинаковые имя и размер — одна копия. */
function dedupeMaterials(materials: ImportedMaterial[]): ImportedMaterial[] {
  const seen = new Set<string>()

  return materials.filter((material) => {
    const key = `${material.title}|${material.size ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function lessonTitle(ref: UnitRef): string {
  if (ref.isDate) {
    const date = dateFromNumber(ref.number)
    const suffix = ref.part ? ` (${ref.part})` : ''
    if (date) return `Созвон ${date}${suffix}`
  }

  const label = cleanTitle(ref.label)
  return label.length > 0 ? label : `Урок ${ref.number}`
}

function dateFromNumber(value: number): string | null {
  const text = String(value)
  if (text.length !== 8) return null

  const year = Number(text.slice(0, 4))
  const month = Number(text.slice(4, 6))
  const day = Number(text.slice(6, 8))

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null

  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`
}

/**
 * Разбирает ведущую нумерацию имени: "5_2 Название" → урок 5, часть 2.
 * Возвращает null, если имя не начинается с числа.
 */
export function parseUnitRef(name: string): UnitRef | null {
  // Раздачи подписывают файлы тегом в начале имени — до нумерации.
  const base = stripExtension(name).replace(NOISE_TAGS, '').trim()

  const worded = /^(?:lesson|lecture|part|урок|занятие|часть)\s*[-_.№#]?\s*(\d+)(.*)$/i.exec(base)
  if (worded) {
    const number = Number(worded[1])
    if (!Number.isSafeInteger(number)) return null
    return { number, part: null, separator: null, label: trimLabel(worded[2]), isDate: false }
  }

  const match = /^(\d+)(?:([_.\-–—])(\d+))?(.*)$/.exec(base)
  if (!match) return null

  const number = Number(match[1])
  if (!Number.isSafeInteger(number)) return null

  const rawPart = match[3] === undefined ? null : Number(match[3])
  const part = rawPart !== null && Number.isSafeInteger(rawPart) ? rawPart : null
  const separator = part === null ? null : normalizeSeparator(match[2])
  const isDate = match[1].length === 8 && dateFromNumber(number) !== null

  return { number, part, separator, label: trimLabel(match[4]), isDate }
}

function normalizeSeparator(raw: string | undefined): '.' | '_' | '-' {
  if (raw === '_') return '_'
  return raw === '.' ? '.' : '-'
}

function trimLabel(raw: string): string {
  return raw.replace(/^[\s._\-–—)]+/, '').trim()
}

/**
 * Номер урока внутри секции. Точка в "1.2" разделяет секцию и урок,
 * подчёркивание в "5_2" — урок и его часть.
 */
function lessonKeyOf(ref: UnitRef): number {
  return ref.separator === '.' && ref.part !== null ? ref.part : ref.number
}

/** Номер части урока — только для формы "5_2". */
function partOf(ref: UnitRef): number | null {
  return ref.separator === '_' ? ref.part : null
}

/** Файлы вида "1.1", "2.3" в одной папке: разные секции внутри неё. */
function dottedRefs(node: TreeNode): UnitRef[] {
  return node.files
    .filter(isVideo)
    .map((file) => parseUnitRef(file.name))
    .filter((ref): ref is UnitRef => ref !== null && ref.separator === '.' && ref.part !== null)
}

function compareVideos(a: ImportedVideo, b: ImportedVideo): number {
  const aPart = a.part ?? 0
  const bPart = b.part ?? 0
  if (aPart !== bPart) return aPart - bPart
  return a.path.localeCompare(b.path, 'ru')
}

function isVideo(item: YandexDiskItem): boolean {
  return item.type === 'file' && VIDEO_EXTENSIONS.has(extensionOf(item.name))
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

function stripExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, '')
}

/** Убирает технические пометки раздач и лишние разделители из названия. */
function cleanTitle(name: string): string {
  return name
    .replace(NOISE_TAGS, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s._\-–—]+|[\s._\-–—]+$/g, '')
    .trim()
}

function normalizePath(path: string): string {
  return path.replace(/^disk:/, '').replace(/^\/+|\/+$/g, '')
}

/** Отрезает папку импорта от пути; null — путь лежит вне неё. */
function stripPrefix(path: string, prefix: string): string | null {
  if (prefix.length === 0) return path
  if (path === prefix) return ''
  return path.startsWith(prefix + '/') ? path.slice(prefix.length + 1) : null
}
