/**
 * Pure helpers over a diarized transcript. The model returns lines shaped
 * `[HH:MM:SS] Спикер 1: реплика`; everything here parses, shifts or renders that shape
 * without touching the network, so the chunk-stitching logic stays unit-testable.
 */

/**
 * Leading timestamp plus the speaker label up to the first colon that separates it from speech.
 * Пробелы внутри скобок допускаются: запасная модель пишет «[ 00:09:50]», и без этого весь
 * её фрагмент оставался без таймкодов и спикеров.
 */
const CUE_RE = /^\[\s*(\d{1,3}):([0-5]\d):([0-5]\d)\s*\]\s*([^\n:]{1,60}?)\s*:\s*/

export interface TranscriptCue {
  atSec: number
  speaker: string
  text: string
}

export function formatTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function formatDurationHuman(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  if (hours > 0) return `${hours} ч ${minutes} мин`
  if (minutes > 0) return `${minutes} мин ${seconds} с`
  return `${seconds} с`
}

/**
 * Реплика, начатая посреди строки: «…текст. [00:00:41] Саша: …». Так Gemini 3.8 Flash
 * 2026-09-30 вернул три из семи 10-минутных фрагментов собеседования - весь фрагмент одной
 * строкой. Разметка спикеров в ней есть, но всё, что ниже работает построчно (повторы, сдвиг
 * меток на начало фрагмента, проверка полноты), видело одну реплику, а метки внутри
 * оставались от начала фрагмента. Разбивка идёт до всей остальной обработки.
 */
const INLINE_CUE_RE = /(\S)[ \t]+(?=\[\s*\d{1,3}:[0-5]\d(?::[0-5]\d)?\s*\]\s*[^\n:[\]]{1,60}?\s*:)/g

export function splitInlineCues(transcript: string): string {
  return transcript.replace(INLINE_CUE_RE, '$1\n')
}

export function parseCue(line: string): TranscriptCue | null {
  const match = CUE_RE.exec(line)
  if (!match) return null
  const [, hh, mm, ss, speaker] = match
  return {
    atSec: parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseInt(ss, 10),
    speaker: speaker.trim(),
    text: line.slice(match[0].length).trim(),
  }
}

/**
 * Модель забегает вперёд по времени (на 29-минутной записи — на 18%), поэтому метка чуть
 * дальше конца фрагмента ещё правдоподобна. Дальше этого запаса — уже не время, а формат.
 */
const TIMESTAMP_SLACK_RATIO = 1.3
const TIMESTAMP_SLACK_SEC = 120

/**
 * Метка без часов: `[07:04]`. Так Gemini написал весь второй фрагмент 56-минутного
 * собеседования. Строгий CUE_RE такую строку не узнаёт, и она не сдвигалась на начало
 * фрагмента: в склейке после 37-й минуты шла 7-я, а проверка полноты по последней
 * узнанной метке ложно сообщала, что конец записи потерян.
 */
const SHORT_CUE_RE = /^\[\s*(\d{1,3}):([0-5]\d)\s*\]/

/**
 * Посреди длинного фрагмента Gemini переключается с `ЧЧ:ММ:СС` на `ММ:СС:доли`: на
 * 98-минутном собеседовании второй час пришёл строками `[37:16:00]`, и после сдвига на
 * час в расшифровке оказалось `38:16:00` при длине записи 1 ч 38 мин. Метка, которая как
 * часы в фрагмент не помещается, а как `ММ:СС` помещается, читается как `ММ:СС`.
 * Сам формат по первой строке не угадать — модель меняет его на ходу, — поэтому решение
 * принимается для каждой реплики отдельно.
 */
export function normalizeChunkTimestamps(transcript: string, chunkDurationSec: number): string {
  if (chunkDurationSec <= 0) return transcript
  const limit = chunkDurationSec * TIMESTAMP_SLACK_RATIO + TIMESTAMP_SLACK_SEC
  return transcript
    .split('\n')
    .map((line) => {
      const short = SHORT_CUE_RE.exec(line)
      if (short) {
        const rest = line.slice(short[0].length).trimStart()
        return `[${formatTimestamp(parseInt(short[1], 10) * 60 + parseInt(short[2], 10))}] ${rest}`
      }
      const match = CUE_RE.exec(line)
      if (!match) return line
      const [, hh, mm] = match
      const rest = line.slice(line.indexOf(']') + 1).trimStart()
      const asHours = parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseInt(match[3], 10)
      const asMinutes = parseInt(hh, 10) * 60 + parseInt(mm, 10)
      // Ни как часы, ни как минуты в фрагмент не лезет — оставляем, чтобы не выдумать время.
      const atSec = asHours <= limit ? asHours : asMinutes <= limit ? asMinutes : asHours
      // Строка всегда переписывается в каноничный вид — остальной код и документ ждут «[ЧЧ:ММ:СС]».
      return `[${formatTimestamp(atSec)}] ${rest}`
    })
    .join('\n')
}

/**
 * Chunked transcription asks each chunk for timestamps relative to its own start, because
 * a model told to offset by 01:20:00 drifts. The offset is applied here instead.
 */
export function shiftTranscriptTimestamps(transcript: string, offsetSec: number): string {
  if (offsetSec <= 0) return transcript
  return transcript
    .split('\n')
    .map((line) => {
      const cue = parseCue(line)
      if (!cue) return line
      return `[${formatTimestamp(cue.atSec + offsetSec)}] ${cue.speaker}: ${cue.text}`
    })
    .join('\n')
}

/** Speakers in order of first appearance — the roster carried into the next chunk. */
export function extractSpeakers(transcript: string): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const line of transcript.split('\n')) {
    const cue = parseCue(line)
    if (!cue || seen.has(cue.speaker)) continue
    seen.add(cue.speaker)
    ordered.push(cue.speaker)
  }
  return ordered
}

/** Сколько последних реплик смотреть, ища повтор: зацикленная модель повторяет одну фразу подряд. */
const REPEAT_WINDOW = 3

/**
 * Зацикливание модели: на проде запасной Gemini Flash повторил одну реплику сотни раз и
 * упёрся в предел длины — 192 тыс. символов на час записи вместо ~40 тыс. Повторы
 * выбрасываются, а доля выброшенного говорит, стоит ли верить фрагменту вообще.
 */
export function collapseRepeatedCues(transcript: string): { text: string; removed: number; total: number } {
  const recent: string[] = []
  const recentTexts: string[] = []
  const speakers = new Set<string>()
  const kept: string[] = []
  let removed = 0
  let total = 0
  for (const line of transcript.split('\n')) {
    const cue = parseCue(line) ?? parseSpeakerlessCue(line)
    if (!cue) {
      kept.push(line)
      continue
    }
    total++
    const text = cue.text.toLowerCase().replace(/\s+/g, ' ').trim()
    const key = `${cue.speaker}\u0001${text}`
    // Второй вид петли: та же фраза, но каждый раз от нового «Спикер N». На фоновом
    // ролике Gemini выдал «Спикер 2651: Thank you.» и насчитал 2654 участника. Живой
    // участник не появляется в разговоре, чтобы дословно повторить предыдущую реплику.
    const newSpeakerEcho = cue.speaker !== '' && !speakers.has(cue.speaker) && recentTexts.includes(text)
    if (text.length > 0 && (recent.includes(key) || newSpeakerEcho)) {
      removed++
      continue
    }
    if (cue.speaker) speakers.add(cue.speaker)
    recent.push(key)
    recentTexts.push(text)
    if (recent.length > REPEAT_WINDOW) recent.shift()
    if (recentTexts.length > REPEAT_WINDOW) recentTexts.shift()
    kept.push(line)
  }
  return { text: kept.join('\n'), removed, total }
}

/**
 * Реплика без спикера: «[00:02:32] [неразборчиво]». Такие строки модель гонит сотнями,
 * когда в записи шум вместо речи, и без спикера они проходили мимо проверки повторов.
 */
function parseSpeakerlessCue(line: string): TranscriptCue | null {
  const match = /^\[\s*\d{1,3}:[0-5]\d(?::[0-5]\d)?\s*\]\s*(\[[^\]\n]{1,40}\])\s*$/.exec(line)
  return match ? { atSec: 0, speaker: '', text: match[1] } : null
}

/** Доля повторов, начиная с которой фрагмент считается зацикленным и расшифровывается заново. */
export const LOOP_REPEAT_RATIO = 0.25
const LOOP_MIN_REPEATS = 15

export function looksLooped(result: { removed: number; total: number }): boolean {
  return result.removed >= LOOP_MIN_REPEATS && result.removed / Math.max(1, result.total) >= LOOP_REPEAT_RATIO
}

export interface SpeakerContext {
  /** Последняя реплика каждого участника — по ней следующий фрагмент узнаёт, кто есть кто. */
  lastLines: { speaker: string; text: string }[]
  /** Конец предыдущего фрагмента: разговор продолжается с этого места. */
  tail: string[]
}

const HINT_LINE_CHARS = 200
const TAIL_CUES = 8

/**
 * Одни имена в следующий фрагмент не помогают: модель не слышала прошлый час и не знает,
 * чей голос «Спикер 1». На собеседовании второй час разметился так, что ответы кандидата
 * получили метку HR из первого часа. С репликами модель различает участников по смыслу:
 * кто задаёт вопросы, кто рассказывает о своём опыте.
 */
export function buildSpeakerContext(transcript: string): SpeakerContext {
  const cues = transcript
    .split('\n')
    .map(parseCue)
    .filter((cue): cue is TranscriptCue => cue !== null && cue.text.length > 0)

  const last = new Map<string, string>()
  for (const cue of cues) last.set(cue.speaker, cue.text)

  const clip = (text: string): string =>
    text.length <= HINT_LINE_CHARS ? text : `${text.slice(0, HINT_LINE_CHARS).trimEnd()}…`

  return {
    lastLines: [...last].map(([speaker, text]) => ({ speaker, text: clip(text) })),
    tail: cues.slice(-TAIL_CUES).map((cue) => `${cue.speaker}: ${clip(cue.text)}`),
  }
}

export function lastTimestampSec(transcript: string): number | null {
  let last: number | null = null
  for (const line of transcript.split('\n')) {
    const cue = parseCue(line)
    if (cue) last = cue.atSec
  }
  return last
}

/**
 * Below this share of the recording covered by the last cue, the transcript is treated as
 * incomplete. Derived from the stored transcript rather than persisted, so it stays correct
 * if the transcript is later edited.
 *
 * Only a *shortfall* is meaningful: measured against a 29-minute recording the model's own
 * timestamps ran ~18% ahead by the end, so an overshoot says nothing, while a last cue at
 * half the duration is a genuine stop-early.
 */
const MIN_COVERAGE_RATIO = 0.8

/**
 * A transcript whose last cue sits far short of the audio length means the model stopped
 * early — the user needs to know that before acting on a summary built from half a call.
 */
export function buildCoverageWarning(transcript: string, durationSec: number): string | null {
  if (durationSec <= 0) return null
  const last = lastTimestampSec(transcript)
  if (last == null) {
    return 'Не удалось разобрать таймкоды — расшифровка может быть неполной.'
  }
  if (last >= durationSec * MIN_COVERAGE_RATIO) return null
  return (
    `Последняя реплика распознана на ${formatDurationHuman(last)} при длительности записи ` +
    `${formatDurationHuman(durationSec)} — расшифровка, вероятно, неполная. ` +
    `Попробуйте отправить запись повторно.`
  )
}

/**
 * The model estimates time by ear rather than reading a clock, and the error accumulates:
 * on a 29:38 recording the closing line came back labelled 35:10, and a mid-recording probe
 * showed 17:21 where the audio actually sits at 15:00. Non-linear, so rescaling would only
 * invent precision — the honest fix is to say so in the document.
 */
export const TIMESTAMP_ACCURACY_NOTE =
  'Таймкоды приблизительные: модель оценивает время на слух и к концу длинной записи ' +
  'уходит вперёд на несколько минут. Порядок реплик точен, точное место в записи — нет.'
