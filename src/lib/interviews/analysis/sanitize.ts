/**
 * The writing rules for slide text, enforced in code.
 *
 * The prompt asks for the same things, but a model breaks them often enough that the
 * deck cannot depend on it: one stray em dash or one "Стоит отметить, что" is visible
 * on a projector. Everything here is a pure function, so the rules are pinned by tests
 * instead of by re-reading generated decks.
 */

import { stripMarkdownEmphasis } from '@/lib/interviews/analysis/markdown'

/**
 * Openers that mark a text as machine-written. Removed only at the start of a sentence:
 * "важно понимать" inside a sentence is ordinary Russian, as an opener it is filler.
 */
const CLICHE_OPENERS: readonly string[] = [
  'стоит отметить, что',
  'стоит отметить что',
  'стоит подчеркнуть, что',
  'важно отметить, что',
  'важно отметить что',
  'важно понимать, что',
  'важно понимать что',
  'важно помнить, что',
  'следует отметить, что',
  'следует учитывать, что',
  'нельзя не отметить, что',
  'необходимо отметить, что',
  'хотелось бы отметить, что',
  'не секрет, что',
  'как известно,',
  'как мы видим,',
  'в современном мире',
  'в наши дни',
  'в эпоху цифровизации',
  'давайте разберёмся',
  'давайте разберемся',
  'давайте рассмотрим',
  'в данной статье',
  'в этой презентации мы',
  'подводя итог,',
  'в заключение хотелось бы отметить, что',
  'итак,',
]

/** Bullet glyphs a model prepends even when told not to — the layout draws its own. */
const LEADING_BULLET = /^\s*(?:[-–—•·‣▪◦*]+|\d+[.)]|[a-zа-я][.)])\s+/u

/**
 * Emoji and pictographs. `\p{Extended_Pictographic}` covers the pictographs themselves
 * the rest strips the invisible scaffolding (skin tones, ZWJ, variation selectors) that
 * would otherwise be left behind as stray boxes.
 */
// Класс намеренно перечисляет отдельные кодовые точки: цель не «сматчить эмодзи целиком»,
// а вырезать и саму пиктограмму, и невидимую обвязку вокруг неё - тон кожи, соединитель,
// селектор начертания. Иначе на слайде остаются пустые квадраты от разобранной
// последовательности.
// eslint-disable-next-line no-misleading-character-class
const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{FE0E}\u{20E3}\u{200D}]/gu

/** Cyrillic is not matched by `\b`, so word edges are spelled out by hand. */
const WORD_START = '(?<![\\p{L}\\p{N}])'

export function stripEmoji(text: string): string {
  return text.replace(EMOJI, '')
}

/** Only the short hyphen is allowed, in any of the shapes a model produces. */
export function normalizeDashes(text: string): string {
  return text
    .replace(/[—–−‒―]/g, '-')
    .replace(/-{2,}/g, '-')
}

/** Ranges and quotes the model borrows from typography and PowerPoint renders unevenly. */
function normalizePunctuation(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, '\'')
    .replace(/…/g, '...')
}

export function removeClicheOpeners(text: string): string {
  let out = String(text ?? '')
  for (const cliche of CLICHE_OPENERS) {
    // Loop per cliche: removing one opener can expose the next ("Итак, стоит отметить, что…").
    for (let guard = 0; guard < 4; guard += 1) {
      const next = removeOpenerOnce(out, cliche)
      if (next === null) break
      out = next
    }
  }
  return out.trim()
}

/**
 * Removes the first occurrence that actually sits at the start of a sentence, and
 * capitalizes the word it exposed. Returns null when there is nothing to remove — the
 * same words mid-sentence are ordinary Russian and stay.
 */
function removeOpenerOnce(text: string, cliche: string): string | null {
  const pattern = new RegExp(`${WORD_START}${escapeRegExp(cliche)}\\s*`, 'giu')
  for (const match of text.matchAll(pattern)) {
    const offset = match.index ?? 0
    const before = text.slice(0, offset).trimEnd()
    if (before.length !== 0 && !/[.!?:;]$/.test(before)) continue
    const head = text.slice(0, offset)
    const rest = capitalizeFirst(text.slice(offset + match[0].length))
    return (head + rest).replace(/^\s+/, '')
  }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function capitalizeFirst(text: string): string {
  if (!text) return text
  const first = text[0]
  const upper = first.toLocaleUpperCase('ru-RU')
  return upper === first ? text : upper + text.slice(1)
}

/**
 * Cuts to `maxLength` on a sentence boundary when one is close enough, otherwise on a
 * word boundary. Never mid-word, and never leaves a dangling comma or preposition-and-nothing.
 */
export function truncateAtBoundary(text: string, maxLength: number): string {
  if (maxLength <= 0) return ''
  if (text.length <= maxLength) return text

  const head = text.slice(0, maxLength)
  const lastSentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  // On a slide a complete short sentence reads better than a trimmed long one, but
  // dropping over half the budget to reach a full stop loses the thought — there a word cut wins.
  if (lastSentence >= maxLength * 0.5) {
    return head.slice(0, lastSentence + 1).trim()
  }

  const lastSpace = head.lastIndexOf(' ')
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head
  return dropDanglingWord(cut.replace(/[\s,;:.-]+$/u, '').trim())
}

/**
 * A cut that lands right after a preposition or a conjunction reads as a sentence that
 * stopped mid-thought: "против 14,7% в". Nothing follows it, so the word goes too.
 */
const DANGLING_TAIL = /(?<![\p{L}\p{N}])(?:в|во|на|над|под|за|из|от|до|к|ко|с|со|у|о|об|обо|по|при|про|для|без|через|между|и|а|но|или|что|как|чем|же|бы|ли)$/iu

function dropDanglingWord(text: string): string {
  const trimmed = text.trimEnd()
  if (!DANGLING_TAIL.test(trimmed)) return trimmed
  return trimmed.replace(DANGLING_TAIL, '').replace(/[\s,;:.-]+$/u, '').trimEnd()
}

/** One line of slide text: title, bullet, card heading, stat label. */
export function sanitizeLine(raw: string, maxLength: number): string {
  const cleaned = baseClean(raw)
    .replace(LEADING_BULLET, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return truncateAtBoundary(dropSentencePeriod(cleaned), maxLength)
}

/**
 * A trailing period on a one-line fragment is noise, but the same character ends an
 * abbreviation - "2,3 п.п.", "25 б.п.", "в 2026 г." - and stripping it there produces a
 * visible typo. So it goes only when the last word is a real word: no dot inside it and
 * longer than two characters.
 */
function dropSentencePeriod(text: string): string {
  if (!text.endsWith('.') || /[.!?]\.$/.test(text)) return text
  const lastWord = text.slice(text.lastIndexOf(' ') + 1)
  const stem = lastWord.slice(0, -1)
  if (stem.length <= 2 || stem.includes('.')) return text
  return text.slice(0, -1)
}

/** A paragraph: cover lead-in, section blurb, speaker notes. */
export function sanitizeParagraph(raw: string, maxLength: number): string {
  const cleaned = baseClean(raw)
    .split('\n')
    .map((line) => line.replace(LEADING_BULLET, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return truncateAtBoundary(cleaned, maxLength)
}

function baseClean(raw: string): string {
  return removeClicheOpeners(
    normalizePunctuation(normalizeDashes(stripEmoji(stripMarkdownEmphasis(String(raw ?? ''))))),
  )
}

/**
 * Applies the line rules to a list and drops what is left empty or duplicated —
 * a repeated bullet is the most common way a deck looks padded.
 */
export function sanitizeLines(values: readonly string[], maxLength: number, maxItems: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const line = sanitizeLine(value, maxLength)
    if (!line) continue
    const key = line.toLocaleLowerCase('ru-RU')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * Reports rule violations that survived cleaning. Used by the test suite and by the
 * worker's own log line — a spike here means the prompt drifted, not that a slide broke.
 */
export function findStyleViolations(text: string): string[] {
  const problems: string[] = []
  // A fresh regex, not the shared global one: `.test()` on a /g regex advances lastIndex
  // and the next call would start mid-string.
  // eslint-disable-next-line no-misleading-character-class
  if (new RegExp(EMOJI.source, 'u').test(text)) problems.push('emoji')
  if (/[—–−]/.test(text)) problems.push('long-dash')
  if (/\*\*|__|^#{1,6}\s/m.test(text)) problems.push('markdown')
  for (const cliche of CLICHE_OPENERS) {
    if (new RegExp(`${WORD_START}${escapeRegExp(cliche)}`, 'iu').test(text)) {
      problems.push(`cliche:${cliche}`)
      break
    }
  }
  return problems
}
