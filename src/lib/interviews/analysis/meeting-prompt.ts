import { formatTimestamp, type SpeakerContext } from '@/lib/interviews/analysis/meeting-transcript'

/**
 * Diarization here is prompt-driven, not a provider feature: Gemini labels speakers when
 * the output shape is pinned down hard enough. The rules below are the ones that actually
 * changed the output — free-form "разметь спикеров" produces a wall of unattributed text.
 */
const BASE_RULES = `Ты — профессиональный транскрибатор деловых встреч и созвонов.

Расшифруй запись максимально точно и полно, с разделением по говорящим.

ПРАВИЛА:

1. Язык. Пиши каждую реплику НА ТОМ ЯЗЫКЕ, на котором она произнесена. Ничего не переводи. Если в записи звучит несколько языков — сохраняй каждый как есть, включая переключения языка внутри одной реплики.

2. Говорящие. Раздели речь по говорящим. Обозначай их «Спикер 1», «Спикер 2» и так далее — по порядку появления. Если участник называет своё имя или к нему обращаются по имени, дальше используй имя вместо номера и держи это обозначение до конца записи. Один и тот же голос — всегда одно и то же обозначение.

3. Формат. Каждая реплика — отдельная строка строго такого вида:
[ЧЧ:ММ:СС] Спикер 1: текст реплики
Таймкод — время начала реплики. Никаких других строк, заголовков, списков и комментариев в ответе быть не должно.

4. Смена говорящего — всегда новая строка. Не склеивай реплики разных людей.

5. Полнота. Расшифруй запись целиком, от начала до конца, не пропуская фрагменты и не сокращая их. Не пересказывай — записывай сказанное.

6. Чистка. Убирай слова-паразиты, заикания и повторы-оговорки («э-э», «ну вот», «то есть, то есть»). Расставляй знаки препинания. Смысл, формулировки, цифры и имена не меняй.

7. Термины. Названия продуктов, технологий и компаний записывай в оригинальном написании (API, Kubernetes, Jira, Figma), не транслитерируй.

8. Неразборчивое. Фрагмент, который не разобрать, помечай [неразборчиво]. Не додумывай и не восстанавливай по смыслу.

9. Неречевое. Значимые неречевые события помечай кратко в квадратных скобках отдельной репликой: [смех], [пауза], [демонстрация экрана]. Шум и молчание не размечай.`

export interface MeetingPromptParams {
  /** Position of this chunk in the recording; 1 for a single-shot transcription. */
  chunkIndex: number
  chunkCount: number
  /** Offset of this chunk from the start of the recording, in seconds. */
  chunkStartSec: number
  /** Speaker labels already established by earlier chunks, so numbering stays stable. */
  knownSpeakers: readonly string[]
  /** Реплики из предыдущего фрагмента — без них модель путает, чья метка чья. */
  speakerContext?: SpeakerContext | null
}

export function buildMeetingPrompt(params: MeetingPromptParams): string {
  if (params.chunkCount <= 1) return BASE_RULES

  const parts = [
    BASE_RULES,
    '',
    `КОНТЕКСТ: это часть ${params.chunkIndex} из ${params.chunkCount}. ` +
      `Она начинается на ${formatTimestamp(params.chunkStartSec)} от начала встречи, ` +
      `но таймкоды в ответе отсчитывай ОТ НАЧАЛА ЭТОЙ ЧАСТИ, начиная с 00:00:00 — ` +
      `сдвиг будет добавлен позже автоматически.`,
  ]

  if (params.knownSpeakers.length > 0) {
    parts.push(
      '',
      `Ранее в записи уже говорили: ${params.knownSpeakers.join(', ')}. ` +
        `Если слышишь те же голоса — используй ровно те же обозначения. ` +
        `Новых участников нумеруй дальше по порядку.`
    )
  }

  const context = params.speakerContext
  if (context && context.lastLines.length > 0) {
    parts.push(
      '',
      'КТО ЕСТЬ КТО. Голоса прошлой части ты не слышал, поэтому узнавай участников по смыслу: ' +
        'кто задаёт вопросы и ведёт разговор, кто отвечает и рассказывает о своём опыте, ' +
        'к кому обращаются по имени. Последняя реплика каждого участника в прошлой части:',
      ...context.lastLines.map((line) => `- ${line.speaker}: «${line.text}»`),
      '',
      'Обозначение, уже закреплённое за участником, не отдавай другому голосу. ' +
        'Если участник из прошлой части молчит, его метку не используй вовсе.',
    )
    if (context.tail.length > 0) {
      parts.push('', 'Прошлая часть закончилась так — разговор продолжается с этого места:', ...context.tail)
    }
  }

  return parts.join('\n')
}
