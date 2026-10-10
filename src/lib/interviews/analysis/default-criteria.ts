import { normalizeCriteria } from '@/lib/interviews/analysis/criteria'
import type { InterviewCriterion } from '@/lib/interviews/analysis/types'

export function defaultInterviewCriteria(directionSlug: string): InterviewCriterion[] {
  const react = /react|frontend/i.test(directionSlug)
  const node = /node|backend/i.test(directionSlug)
  const core = react ? [
    ['react', 'React.js', 'Компоненты, hooks, состояние, рендеринг, эффекты и выбор решений на практике.'],
    ['browser', 'Браузер, HTML и CSS', 'DOM, доступность, вёрстка и понимание работы браузера.'],
  ] : node ? [
    ['node', 'Node.js', 'Event loop, асинхронность, обработка ошибок, потоки и серверная производительность.'],
    ['backend', 'API и базы данных', 'HTTP, архитектура API, SQL, транзакции, безопасность и надёжность сервера.'],
  ] : [
    ['language', 'Язык и платформа', 'Понимание основ выбранного языка, среды исполнения и практического применения.'],
    ['architecture', 'Архитектура', 'Обоснование решений, альтернативы, тестируемость и надёжность.'],
  ]
  return normalizeCriteria([
    ...core.map(([id, name, description]) => ({ id, name, description, kind: 'must', weight: 3 })),
    ...(react || node ? [{ id: 'javascript', name: 'JavaScript и TypeScript', description: 'Семантика языка, типы, асинхронность и объяснение поведения кода.', kind: 'must', weight: 3 }] : []),
    { id: 'livecoding', name: 'Лайвкодинг и решение задач', description: 'Понимание условия, ход рассуждений, корректность кода, краевые случаи и проверка результата. По аудио нельзя проверить неозвученный код на экране.', kind: 'nice', weight: 3 },
    { id: 'practice', name: 'Практический опыт и выбор решений', description: 'Конкретные примеры своей работы, самостоятельность, причины выбора и компромиссы.', kind: 'nice', weight: 2 },
    { id: 'communication', name: 'Коммуникация и структура ответов', description: 'Понятность ответа, уточнение вопроса, честное обозначение пробелов и объяснение решения.', kind: 'soft', weight: 2 },
  ])
}
