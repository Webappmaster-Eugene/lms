/**
 * Компиляция и проверка типов TypeScript.
 *
 * Живёт в дочернем процессе (см. runner-child.mjs): полная проверка типов
 * стоит 200–400 мс CPU, и держать её на главном event loop Next-сервера нельзя.
 *
 * Файл намеренно .mjs: дочерний процесс запускается напрямую через node и не
 * проходит через сборку Next.
 */
import ts from 'typescript'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

const require_ = createRequire(import.meta.url)

/** Виртуальные имена файлов внутри программы. */
const SOLUTION_FILE = '/solution.ts'

const COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmitOnError: false,
  skipLibCheck: true,
  noImplicitOverride: true,
  exactOptionalPropertyTypes: false,
  forceConsistentCasingInFileNames: true,
  isolatedModules: false,
  allowJs: false,
}

/** Библиотеки типов, которых достаточно для задач тренажёра. */
const LIB_FILES = [
  'lib.es2022.d.ts',
  'lib.es2022.full.d.ts',
  'lib.dom.d.ts',
  'lib.dom.iterable.d.ts',
]

let libCache = null

/**
 * Читает lib.*.d.ts из пакета typescript.
 *
 * Считываются транзитивно: lib.es2022.d.ts — это цепочка `/// <reference lib="..." />`,
 * и без разрешения ссылок программа осталась бы без Array, Promise и Map.
 */
function loadLibs() {
  if (libCache) return libCache

  const libDir = path.dirname(require_.resolve('typescript'))
  const files = new Map()

  const read = (name) => {
    if (files.has(name)) return
    const filePath = path.join(libDir, name)
    let content
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch {
      return
    }
    files.set(name, content)
    const references = content.matchAll(/\/\/\/\s*<reference\s+lib="([^"]+)"\s*\/>/g)
    for (const match of references) read(`lib.${match[1]}.d.ts`)
  }

  for (const name of LIB_FILES) read(name)

  if (files.size === 0) {
    throw new Error(`Не найдены файлы библиотек TypeScript в ${libDir}`)
  }

  libCache = { libDir, files }
  return libCache
}

function createHost(sources) {
  const { files: libs } = loadLibs()

  return {
    getSourceFile(fileName, languageVersion) {
      const text = sources.get(fileName) ?? libs.get(path.basename(fileName))
      if (text === undefined) return undefined
      return ts.createSourceFile(fileName, text, languageVersion, true)
    },
    writeFile() {},
    getDefaultLibFileName: () => 'lib.es2022.full.d.ts',
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (fileName) => sources.has(fileName) || libs.has(path.basename(fileName)),
    readFile: (fileName) => sources.get(fileName) ?? libs.get(path.basename(fileName)),
    directoryExists: () => true,
    getDirectories: () => [],
  }
}

/**
 * Хелперы для задач на систему типов. Тот же набор, что в type-challenges,
 * чтобы условия задач читались привычно.
 */
export const TYPE_HELPERS = `type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
type NotEqual<X, Y> = true extends Equal<X, Y> ? false : true
type Expect<T extends true> = T
type ExpectFalse<T extends false> = T
type IsTrue<T extends true> = T
type IsFalse<T extends false> = T
type Alike<X, Y> = Equal<X, Y>
type ExpectExtends<VALUE, EXPECTED> = EXPECTED extends VALUE ? true : false
type Debug<T> = { [K in keyof T]: T[K] }
`

/**
 * Перевод диагностики tsc в наш формат.
 *
 * Решение, преамбула и проверка типов лежат в ОДНОМ виртуальном файле — иначе
 * объявленные пользователем типы не были бы видны в `Expect<Equal<...>>` без
 * импортов. Поэтому строку приходится вычислять вычитанием: всё, что выше
 * решения (хелперы + преамбула), отрезается, а всё, что ниже, помечается как
 * диагностика проверки типов — в UI это «твой тип не сошёлся с эталоном», а не
 * ошибка в конкретной строке решения.
 */
function toDiagnostic(diagnostic, layout) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
  let absoluteLine = 1
  let column = 1

  if (diagnostic.file && typeof diagnostic.start === 'number') {
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    absoluteLine = position.line + 1
    column = position.character + 1
  }

  const line = absoluteLine - layout.offsetLines
  const inHarness = line < 1 || line > layout.userLineCount

  return {
    line: inHarness ? 1 : line,
    column: inHarness ? 1 : Math.max(1, column),
    code: diagnostic.code,
    message,
    category: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
    inHarness,
  }
}

/**
 * Транспилирует TypeScript в JavaScript и, если попросили, проверяет типы.
 *
 * @param {{ code: string, setupCode?: string, typeHarness?: string, checkTypes?: boolean }} input
 * @returns {{ js: string, diagnostics: Array<object> }}
 */
export function compile(input) {
  const emitted = ts.transpileModule(input.code, {
    compilerOptions: { ...COMPILER_OPTIONS, isolatedModules: true },
    reportDiagnostics: false,
  })

  if (!input.checkTypes) {
    return { js: emitted.outputText, diagnostics: [] }
  }

  const setupCode = input.setupCode ?? ''
  const typeHarness = input.typeHarness ?? ''

  const header = setupCode.trim().length > 0 ? `${TYPE_HELPERS}\n${setupCode}\n` : `${TYPE_HELPERS}\n`
  const footer = typeHarness.trim().length > 0 ? `\n${typeHarness}` : ''

  const layout = {
    offsetLines: countLines(header),
    userLineCount: countLines(input.code) + 1,
  }

  const sources = new Map([[SOLUTION_FILE, header + input.code + footer]])

  const program = ts.createProgram({
    rootNames: [SOLUTION_FILE],
    options: COMPILER_OPTIONS,
    host: createHost(sources),
  })

  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ].map((diagnostic) => toDiagnostic(diagnostic, layout))

  return { js: emitted.outputText, diagnostics }
}

/** Количество переводов строки — оно же смещение следующего блока. */
function countLines(text) {
  if (text.length === 0) return 0
  return text.split('\n').length - 1
}
