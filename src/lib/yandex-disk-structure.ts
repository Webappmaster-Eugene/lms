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
/**
 * Расширение .ts носят и транспортные потоки (видео), и исходники TypeScript.
 * Различаем по размеру: в библиотеке записи весят от 5 МБ (медиана 160 МБ),
 * а исходники — до 64 КБ, промежуточных нет. Порог с большим запасом.
 */
const AMBIGUOUS_VIDEO_EXTENSIONS = new Set(['ts'])
const MIN_AMBIGUOUS_VIDEO_BYTES = 2 * 1024 * 1024
const TEXT_EXTENSIONS = new Set(['txt', 'md'])

/** Суффикс папки-наложения с дополнительными материалами: "Курс (доп)". */
const OVERLAY_SUFFIX = /^(.+?)\s*\((?:доп|доп\.|дополнительно|материалы)\)$/i

/** Технические пометки раздач, которые не должны попадать в названия уроков. */
const NOISE_TAGS = /\s*[[(](?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|skladchik[^\])]*)[\])]/gi

/**
 * Хвостовое служебное слово «метка» из имён файлов автора: для студента это шум.
 * Требуем пробел перед словом, иначе пострадали бы «Разметка», «Заметка» и подобные.
 */
const AUTHOR_MARK = /\s+метка\s*$/i

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
  /** Путь внутри импортируемой папки — по нему строится структура курса. */
  path: string
  /** Полный путь на Диске — только он годится для ссылки на папку. */
  diskPath: string
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
      sections.push(buildSection(rootFiles, title))
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
      lesson.materials = capMaterials(dedupeMaterials(lesson.materials))
      lesson.title = disambiguate(lesson.title, lesson.order, section.lessons)
      lesson.videos.sort(compareVideos)
      lesson.videos.forEach((video, videoIndex) => {
        video.title = lesson.videos.length > 1 ? `Часть ${videoIndex + 1}` : lesson.title
      })
    })
  })

  const split = sections.flatMap(splitOversizedSection)
  split.forEach((section, index) => {
    section.order = index + 1
  })

  const withLessons = split.filter((section) => section.lessons.length > 0)
  for (const empty of split.filter((section) => section.lessons.length === 0)) {
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
  const root: TreeNode = { name: '', path: '/', diskPath: `/${prefix}`, dirs: [], files: [] }
  const nodes = new Map<string, TreeNode>([['', root]])

  /** Возвращает узел каталога, достраивая недостающих предков. */
  const ensureDir = (dirPath: string): TreeNode => {
    const key = normalizePath(dirPath)
    const existing = nodes.get(key)
    if (existing) return existing

    const segments = key.split('/').filter(Boolean)
    const name = segments[segments.length - 1] ?? ''
    const parent = ensureDir(segments.slice(0, -1).join('/'))
    const node: TreeNode = {
      name,
      path: `/${key}`,
      diskPath: `/${[prefix, key].filter(Boolean).join('/')}`,
      dirs: [],
      files: [],
    }

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

/** Больше этого числа файлов — папка сворачивается в одну ссылку. */
const MAX_FOLDER_FILES = 12

/** Столько ссылок в уроке ещё читаются глазами. */
const MAX_LESSON_MATERIALS = 12

/**
 * Ярлыки .url в раздачах бывают двух сортов: полезные ссылки на документацию
 * ("NestJS gRPC.url") и реклама площадок, откуда курс «слили». Вторые студенту
 * показывать незачем — отсеиваем по названию, остальные ярлыки оставляем.
 */
const AD_SHORTCUTS = /(eground|topkursy|freecoursesonline|onehack|ftuapps|sw\.band|скачивай платные|как зайти на сайт с курсами)/i

function isAdShortcut(file: YandexDiskItem): boolean {
  return extensionOf(file.name) === 'url' && AD_SHORTCUTS.test(file.name)
}

/** Файл, который имеет смысл показать студентом материалом урока. */
function isMaterialFile(file: YandexDiskItem): boolean {
  return !isVideo(file) && !isAdShortcut(file)
}

/** Раздаточные материалы, которые имеет смысл открывать по отдельности. */
const HANDOUT_EXTENSIONS = new Set([
  'zip', 'rar', '7z', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
])

/**
 * Материалы папки без видео. Распакованный проект — это сотни .ts, .png и
 * .css, ссылка на каждый файл превращает урок в файловый менеджер. Такую
 * папку сворачиваем в одну ссылку, отдельно оставляя архивы и документы.
 */
function materialsOf(node: TreeNode): ImportedMaterial[] {
  const files = collectFiles(node).filter(isMaterialFile)
  if (files.length <= MAX_FOLDER_FILES) return files.map(toMaterial)

  const handouts = files.filter((file) => HANDOUT_EXTENSIONS.has(extensionOf(file.name)))
  const folder: ImportedMaterial = {
    title: `${cleanTitle(node.name) || 'Материалы'} — папка на Диске`,
    // Ссылка строится от корня публикации, поэтому путь нужен полный
    path: node.diskPath,
    isText: false,
    size: null,
  }

  return handouts.length > MAX_FOLDER_FILES ? [folder] : [folder, ...handouts.map(toMaterial)]
}

/** Кладёт материалы в первый урок последней секции — ближайший по смыслу. */
function attachMaterials(
  sections: ImportedSection[],
  materials: ImportedMaterial[],
  title: string,
): void {
  if (materials.length === 0) return

  const lesson = sections[sections.length - 1]?.lessons[0]

  if (lesson) {
    lesson.materials.push(...materials)
    return
  }

  sections.push({
    order: 0,
    title,
    lessons: [{ order: 1, title: 'Материалы', videos: [], hasGeneratedTitle: false, materials }],
  })
}

/** Спускается по дереву, превращая в секции те узлы, что ими являются. */
function collectSections(node: TreeNode, sections: ImportedSection[], warnings: string[]): void {
  const kind = classify(node)

  if (kind === 'materials') {
    attachMaterials(sections, materialsOf(node), cleanTitle(node.name) || 'Материалы')
    return
  }

  if (kind === 'group') {
    // Видео самой папки-группы образуют свою секцию — иначе они потерялись бы.
    if (node.files.some(isVideo)) {
      const ownFiles: TreeNode = { ...node, dirs: [] }
      if (computeKind(ownFiles) === 'multi') {
        sections.push(...buildDottedSections(ownFiles, warnings))
      } else {
        sections.push(buildSection(ownFiles, cleanTitle(node.name)))
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

  sections.push(buildSection(node, cleanTitle(node.name)))
}

function buildSection(node: TreeNode, title: string): ImportedSection {
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

  for (const file of node.files.filter(isMaterialFile)) {
    const ref = parseUnitRef(file.name)
    const target = ref ? lessons.get(lessonKeyOf(ref)) : undefined

    // Материал без своего урока относится ко всей секции — кладём в первый урок.
    ;(target?.materials ?? sectionMaterials(lessons)).push(toMaterial(file))
  }

  // Папка без видео принадлежит уроку со своим номером ("8/Креативы"), иначе секции.
  for (const dir of materialDirs) {
    const ref = parseUnitRef(dir.name)
    const target = ref ? lessons.get(lessonKeyOf(ref)) : undefined

    ;(target?.materials ?? sectionMaterials(lessons)).push(...materialsOf(dir))
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

    const section: ImportedSection = {
      order: number,
      title: suffix ?? `Раздел ${number}`,
      lessons: [...lessons.values()].sort((a, b) => a.order - b.order),
    }

    // Имени у раздела нет — пробуем вытащить тему из самих уроков
    if (!suffix) applySectionTheme(section)

    sections.push(section)
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
  for (const file of node.files.filter(isMaterialFile)) {
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

/** Разделитель между темой раздела и названием урока: "Введение - Обзор проекта". */
const THEME_SEPARATOR = /\s*[-—–:|]\s+/
/** Доля уроков раздела, которая должна нести тему, чтобы считать её общей. */
const MIN_THEME_SHARE = 0.6
const MIN_THEME_LESSONS = 2
const MIN_THEME_LENGTH = 3
/** Сколько последних слов пробуем как тему в хвосте названия. */
const MAX_THEME_WORDS = 4

/**
 * Достаёт тему безымянного раздела из повторяющейся части названий уроков.
 *
 * Часть авторов дублирует раздел в имени каждого файла — в начале
 * ("Введение - Обзор проекта") или в хвосте ("Почему Golang Введение").
 * Тогда раздел остаётся «Разделом N», а названия уроков несут лишний повтор.
 * Тему берём только если её несёт большинство уроков, и снимаем её лишь там,
 * где после снятия остаётся непустое название.
 */
function applySectionTheme(section: ImportedSection): void {
  if (section.lessons.length < MIN_THEME_LESSONS) return

  const titles = section.lessons.map((lesson) => lesson.title)
  const theme = pickTheme(titles)
  if (!theme) return

  section.title = theme
  section.lessons.forEach((lesson) => {
    const stripped = stripTheme(lesson.title, theme)
    if (stripped) lesson.title = stripped
  })
}

/** Тема с наибольшим охватом; при равенстве — более длинная (она конкретнее). */
function pickTheme(titles: string[]): string | null {
  const needed = Math.max(MIN_THEME_LESSONS, Math.ceil(titles.length * MIN_THEME_SHARE))

  let best: { theme: string; covered: number } | null = null

  for (const candidate of themeCandidates(titles)) {
    const covered = titles.filter((title) => stripTheme(title, candidate) !== null).length
    if (covered < needed) continue

    const better = !best ||
      covered > best.covered ||
      (covered === best.covered && candidate.length > best.theme.length)

    if (better) best = { theme: candidate, covered }
  }

  return best?.theme ?? null
}

/** Возможные темы: начало до разделителя, хвост после него и просто последние слова. */
function themeCandidates(titles: string[]): string[] {
  const found = new Set<string>()

  const add = (value: string | undefined): void => {
    const text = value?.trim() ?? ''
    if (text.length >= MIN_THEME_LENGTH && !/^\d+$/.test(text)) found.add(text)
  }

  for (const title of titles) {
    const parts = title.split(THEME_SEPARATOR)
    if (parts.length > 1) {
      add(parts[0])
      add(parts[parts.length - 1])
    }

    const words = title.split(/\s+/)
    for (let count = 1; count <= Math.min(MAX_THEME_WORDS, words.length - 1); count++) {
      add(words.slice(words.length - count).join(' '))
    }
  }

  return [...found]
}

/**
 * Снимает тему с начала или конца названия.
 * null — темы в названии нет либо после снятия ничего не остаётся.
 */
function stripTheme(title: string, theme: string): string | null {
  const lower = title.toLowerCase()
  const needle = theme.toLowerCase()

  if (lower.startsWith(needle)) {
    const rest = title.slice(theme.length)
    const cleaned = rest.replace(new RegExp(`^${THEME_SEPARATOR.source}`), '').trim()
    if (cleaned.length > 0 && cleaned.length < title.length) return cleaned
  }

  // Хвост встречается и без пробела: "Обзор курсовВведение"
  if (lower.endsWith(needle)) {
    const rest = title.slice(0, title.length - theme.length)
    const cleaned = rest.replace(new RegExp(`${THEME_SEPARATOR.source}$`), '').trim()
    if (cleaned.length > 0 && cleaned.length < title.length) return cleaned
  }

  return null
}

/** Курсы с плоской нумерацией дают одну секцию на сотню уроков — режем на блоки. */
const MAX_FLAT_SECTION = 30
const SECTION_CHUNK = 10

/**
 * Сотня уроков одним списком непролистываема, поэтому большие секции дробим.
 *
 * Сначала пробуем авторскую разбивку: часть курсов пишет название раздела в
 * скобках у первого урока блока ("12. Обзор проекта (Компоненты)"). Если
 * разметки нет, а названия сгенерированы из нумерации, режем по десять.
 * Секцию с осмысленными названиями и без разметки оставляем как есть —
 * придуманные границы были бы хуже честного длинного списка.
 */
function splitOversizedSection(section: ImportedSection): ImportedSection[] {
  if (section.lessons.length <= MAX_FLAT_SECTION) return [section]

  const byMarkers = splitBySectionMarkers(section)
  if (byMarkers) return byMarkers

  if (!section.lessons.every((lesson) => /^Урок \d+$/.test(lesson.title))) return [section]

  const chunks: ImportedSection[] = []

  for (let start = 0; start < section.lessons.length; start += SECTION_CHUNK) {
    const lessons = section.lessons.slice(start, start + SECTION_CHUNK)
    chunks.push({
      order: 0,
      title: `Уроки ${start + 1}–${start + lessons.length}`,
      lessons: lessons.map((lesson, index) => ({ ...lesson, order: index + 1 })),
    })
  }

  return chunks
}

/** Минимум маркеров, чтобы считать скобки разметкой разделов, а не случайностью. */
const MIN_SECTION_MARKERS = 3

/** Разбивка по названиям разделов в скобках у первого урока блока. */
function splitBySectionMarkers(section: ImportedSection): ImportedSection[] | null {
  const markers = section.lessons
    .map((lesson, index) => ({ index, name: /\(([^)]+)\)\s*$/.exec(lesson.title)?.[1]?.trim() }))
    .filter((item): item is { index: number; name: string } => Boolean(item.name))

  if (markers.length < MIN_SECTION_MARKERS) return null

  const result: ImportedSection[] = []
  const bounds = markers.map((m) => m.index)

  if (bounds[0] > 0) {
    result.push({ order: 0, title: section.title, lessons: section.lessons.slice(0, bounds[0]) })
  }

  markers.forEach((marker, position) => {
    const end = bounds[position + 1] ?? section.lessons.length
    const lessons = section.lessons.slice(marker.index, end).map((lesson, index) => ({
      ...lesson,
      order: index + 1,
      title: stripSuffix(lesson.title, marker.name) || lesson.title,
    }))
    result.push({ order: 0, title: marker.name, lessons })
  })

  return result
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

  const collectVideos = (current: TreeNode): void => {
    for (const file of current.files.filter(isVideo)) {
      const fileRef = parseUnitRef(file.name)
      videos.push({ title: '', path: file.path, part: fileRef ? partOf(fileRef) : null })
    }
    current.dirs.forEach(collectVideos)
  }
  collectVideos(node)
  materials.push(...materialsOf(node))

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

/**
 * Файлы вида "1 часть", "2 часть" дают одинаковые названия уроков — к таким
 * добавляем номер, иначе в списке секции подряд идут неразличимые пункты.
 */
function disambiguate(title: string, order: number, lessons: ImportedLesson[]): string {
  const twins = lessons.filter((lesson) => lesson.title === title)
  return twins.length > 1 ? `${title} ${order}` : title
}

/**
 * Урок не должен превращаться в файловый менеджер: если материалов набралось
 * слишком много (обычно это исходники соседних уроков), оставляем архивы,
 * документы и тексты, а россыпь файлов заменяем одной ссылкой на их папку.
 */
function capMaterials(materials: ImportedMaterial[]): ImportedMaterial[] {
  if (materials.length <= MAX_LESSON_MATERIALS) return materials

  const keep = materials.filter(
    (material) =>
      material.isText ||
      material.size === null ||
      HANDOUT_EXTENSIONS.has(extensionOf(material.title)),
  )
  const dropped = materials.filter((material) => !keep.includes(material))
  if (dropped.length === 0) return materials

  const folder = commonParent(dropped.map((material) => material.path))

  return [
    ...keep,
    {
      title: `${cleanTitle(folder.split('/').pop() ?? '') || 'Исходники'} — папка на Диске`,
      path: folder,
      isText: false,
      size: null,
    },
  ]
}

/** Ближайшая общая папка для набора путей. */
function commonParent(paths: string[]): string {
  const parts = paths.map((path) => path.split('/').slice(0, -1))
  const [first, ...rest] = parts
  const common = first.filter((segment, index) => rest.every((other) => other[index] === segment))

  return common.join('/') || '/'
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
  if (item.type !== 'file') return false

  const extension = extensionOf(item.name)
  if (VIDEO_EXTENSIONS.has(extension)) return true

  // .ts без размера считаем исходником: ошибиться в эту сторону безопаснее
  return (
    AMBIGUOUS_VIDEO_EXTENSIONS.has(extension) &&
    (item.size ?? 0) >= MIN_AMBIGUOUS_VIDEO_BYTES
  )
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
    .replace(AUTHOR_MARK, '')
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
