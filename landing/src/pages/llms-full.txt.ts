import type { APIRoute } from 'astro'

import { AUTHOR_URL, MENTOR_SITE_URL, SITE_URL } from '../config'
import {
  AUDIENCE, BOOTCAMP_PATH, FACTS, FAQ, FORMAT_PATH, NOT_FOR, OFFER_PATH, PAGE_UPDATED, PAYMENT_PATH, PROGRAM, PROGRAM_PATH, QUALITY_PATH,
  SAMPLE_MANUAL, SUMMARY, WEEK_RHYTHM,
} from '../data/bootcamp'
import { COMPETENCIES, PROGRAM_WEEKS_DETAILED, QUESTIONS_TEXT, WEEK_STACK, weekAnchor, weekDates, weekWorkText } from '../data/bootcamp-program'
import { programWeeksLabel } from '../data/courses-feed'

/**
 * Всё о буткемпе одним файлом для ИИ-поиска: те же данные, что на страницах, плюс программа по
 * неделям из методичек. В поисковый индекс не идёт (X-Robots-Tag в nginx.conf), в карте сайта его нет.
 */
const url = (path: string) => new URL(path, SITE_URL).href

const week = (item: (typeof PROGRAM_WEEKS_DETAILED)[number]) => [
  `### Неделя ${item.number}. ${item.title}`,
  '',
  `${item.subtitle}. ${item.number === 0 ? 'Неделя подготовки до старта' : `Встречи ${weekDates(item.number)}`}. ${weekWorkText(item)}. Технологии и темы: ${WEEK_STACK[item.number]?.join(', ')}. Подробно: ${url(PROGRAM_PATH)}#${weekAnchor(item.number)}`,
  ...(item.task ? ['', `Задача недели: ${item.task}`] : []),
  ...(item.outcomes.length ? ['', 'Чему научитесь:', ...item.outcomes.map((line) => `- ${line}`)] : []),
  ...(item.questions.length ? ['', 'Вопросы собеседования:', ...item.questions.map((line, index) => `${index + 1}. ${line}`)] : []),
].join('\n')

const text = `# Буткемп Node.js от MentorCareer

> ${SUMMARY}

Обновлено ${PAGE_UPDATED.text}. Страница буткемпа: ${url(BOOTCAMP_PATH)}

## Факты

${FACTS.map(({ term, value }) => `- ${term}: ${value}`).join('\n')}

## Для кого

${AUDIENCE.map(({ title, text: about }) => `- ${title}. ${about}`).join('\n')}

Кому не подойдёт:
${NOT_FOR.map((line) => `- ${line}`).join('\n')}

## Как проходит обучение

${WEEK_RHYTHM.map(({ when, what }) => `- ${when}: ${what}`).join('\n')}

Работа недели сдаётся через merge request в GitLab курса. CI проверяет типы, линтер и тесты на Node.js 22 и 26, доверенная проверка запускает код на закрытых тестах в отдельной виртуальной машине, затем код читает наставник. Долг по неделе можно закрыть позже, до защиты; в середине потока запасная неделя без новой темы; один раз за программу можно взять паузу до 4 недель. Защита длится около 60 минут: демонстрация, вопросы по решениям, незнакомый сбой или изменение при наставнике и итог с паспортом навыков. Подробно: ${url(FORMAT_PATH)}

## Календарь потока

${PROGRAM.map(({ dates, weeks, topic }) => `- ${dates}${weeks ? `, ${programWeeksLabel(weeks).toLowerCase()}` : ''}: ${topic}`).join('\n')}

## Программа по неделям

Текст методичек курса: задача недели, чему вы научитесь и ${QUESTIONS_TEXT} собеседования. Ответы разбираются в методичках и на занятиях. Методичка недели 1 открыта целиком: ${url(SAMPLE_MANUAL.href)}

${PROGRAM_WEEKS_DETAILED.map(week).join('\n\n')}

## Навыки, которые подтверждает защита

${Object.values(COMPETENCIES).map(({ title }) => `- ${title}`).join('\n')}

## Частые вопросы

${FAQ.map(({ question, answer }) => `### ${question}\n\n${answer}`).join('\n\n')}

## Ссылки

- Оплата и возврат: ${url(PAYMENT_PATH)}
- Договор-оферта: ${url(OFFER_PATH)}
- Как мы отвечаем за качество: ${url(QUALITY_PATH)}
- Личное менторство и консультации: ${MENTOR_SITE_URL}/
- Наставник Евгений Надточеев: ${AUTHOR_URL}/
`

export const GET: APIRoute = () => new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
