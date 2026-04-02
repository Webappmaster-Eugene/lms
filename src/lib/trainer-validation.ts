/**
 * Валидация вывода кода тренажёра.
 * Сравнивает фактический console.log output с ожидаемым.
 */

/**
 * Нормализует строку output для сравнения:
 * - Убирает trailing whitespace на каждой строке
 * - Нормализует переносы строк
 * - Убирает ведущие/завершающие пустые строки
 */
function normalizeOutput(output: string): string {
  return output
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

/**
 * Проверяет, совпадает ли фактический output с ожидаемым.
 */
export function validateOutput(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected)
}

/**
 * Возвращает детальный результат сравнения output.
 */
export function compareOutput(actual: string, expected: string): ComparisonResult {
  const normalizedActual = normalizeOutput(actual)
  const normalizedExpected = normalizeOutput(expected)

  if (normalizedActual === normalizedExpected) {
    return { passed: true, actualLines: normalizedActual.split('\n'), expectedLines: normalizedExpected.split('\n') }
  }

  const actualLines = normalizedActual.split('\n')
  const expectedLines = normalizedExpected.split('\n')

  const differences: LineDifference[] = []
  const maxLines = Math.max(actualLines.length, expectedLines.length)

  for (let i = 0; i < maxLines; i++) {
    const actualLine = actualLines[i] ?? ''
    const expectedLine = expectedLines[i] ?? ''

    if (actualLine !== expectedLine) {
      differences.push({
        lineNumber: i + 1,
        actual: actualLine,
        expected: expectedLine,
      })
    }
  }

  return { passed: false, actualLines, expectedLines, differences }
}

export type LineDifference = {
  lineNumber: number
  actual: string
  expected: string
}

export type ComparisonResult = {
  passed: boolean
  actualLines: string[]
  expectedLines: string[]
  differences?: LineDifference[]
}
