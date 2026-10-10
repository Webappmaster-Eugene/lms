import type { CompanyEvidence } from '@/lib/trainer/metadata'
import type { TrainerTaskSeed } from './types'

function evidence(company: CompanyEvidence['company'], kind: CompanyEvidence['kind'], url: string, note: string): CompanyEvidence {
  return { company, kind, url, note, checkedAt: '2026-10-10' }
}

/** These links establish a published example, a report or a preparation topic, never a frequency ranking. */
export function documentedCompanySources(task: TrainerTaskSeed): CompanyEvidence[] {
  const result: CompanyEvidence[] = []
  const tags = task.tags ?? []
  if (task.slug === 'is-anagram') result.push(evidence('yandex', 'official', 'https://yandex.ru/jobs/interview/algorithms/', 'Адаптация официального примера про анаграммы. Нормализация регистра и пробелов — правило нашей версии; частота на интервью не опубликована.'))
  else if (['my-promise-all-settled', 'retry-backoff'].includes(task.slug)) result.push(evidence('yandex', 'candidate-report', 'https://www.youtube.com/watch?v=ilZiDZ_rXXo', 'Автор Максим Филанович сообщает о таком типе задачи на своих интервью. Это учебная адаптация; один рассказ не доказывает частоту.'))
  else if (task.languages.some((language) => language === 'js' || language === 'ts') && tags.some((tag) => ['closures', 'this', 'event-loop', 'promise', 'async'].includes(tag))) {
    result.push(evidence('yandex', 'preparation', 'https://yandex.ru/jobs/interview/frontend', 'Учебная задача по темам официальной JS-секции. Эта формулировка не опубликована как конкретный вопрос компании.'))
  }
  if (task.languages.includes('react')) result.push(evidence('tbank', 'preparation', 'https://www.tbank.ru/career/it/interview/javascript/frontend/', 'Учебный компонент для подготовки к React-секции. Компания описывает темы, но не публикует именно этот компонент или частоту его появления.'))
  if (task.languages.includes('python') || ['binary-search', 'quick-sort', 'merge-sort', 'graph-bfs', 'graph-dfs', 'hash-table', 'queue', 'linked-list', 'binary-search-tree', 'trie'].includes(task.slug)) {
    result.push(evidence('microsoft', 'preparation', 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing', 'Подготовка по официальным рекомендациям о структурах данных и алгоритмах. Конкретная задача компании не подтверждена.'))
  }
  if (task.slug === 'interview-go-stable-fan-in') result.push(evidence('mts', 'official', 'https://habr.com/ru/companies/mts/articles/909158/', 'Интервьюер МТС/KION публикует задачу объединения каналов. В нашей адаптации добавлены JSON-ввод и стабильный порядок результата.'))
  else if (task.slug.startsWith('interview-go-') && !task.slug.includes('balance')) {
    result.push(evidence('mts', 'preparation', 'https://habr.com/ru/companies/mts/articles/909158/', 'Учебная задача по Go-темам из статьи интервьюера МТС/KION. Именно эта формулировка не подтверждена как вопрос его пула.'))
  }
  if (['interview-go-slice-snapshot', 'interview-go-ordered-worker-pool', 'interview-go-context-prefix'].includes(task.slug)) {
    result.push(evidence('wildberries', 'candidate-report', 'https://habr.com/ru/articles/683920/', 'Кандидат описывает Go runtime и синхронизацию на интервью WB. Условие нашей тренировки авторское; точный вопрос и его частота не установлены.'))
  }
  return result
}
