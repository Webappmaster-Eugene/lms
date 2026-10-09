export type UserPerformanceData = { windowDays: number; metrics: { name: 'LCP' | 'INP' | 'CLS'; sampleCount: number; p75: number | null }[] }
const labels = { LCP: 'Загрузка основного содержимого', INP: 'Отзывчивость на действия', CLS: 'Стабильность страницы' }

function metricValue(name: 'LCP' | 'INP' | 'CLS', value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return 'Нет данных'
  if (name === 'LCP') return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value / 1000)} с`
  if (name === 'INP') return `${Math.round(value)} мс`
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value)
}

export function UserPerformanceSummary({ data }: { data: UserPerformanceData }) {
  return <section className="student-analytics__section" aria-label="Скорость сайта у пользователя"><details><summary>Скорость сайта у пользователя за {data.windowDays} дней</summary><p>Показаны измерения из браузеров этого пользователя. Для 75% наблюдений значение не выше показанного. Отсутствующее измерение не считается хорошим результатом.</p><dl className="student-analytics__performance">{data.metrics.map((metric) => <div key={metric.name}><dt>{labels[metric.name]} ({metric.name})</dt><dd><strong>{metricValue(metric.name, metric.p75)}</strong><small>Наблюдений: {metric.sampleCount}</small>{metric.sampleCount > 0 && metric.sampleCount < 30 && <small>Наблюдений пока мало; выводы делать рано.</small>}{metric.sampleCount === 0 && <small>Замеры появятся после посещения страниц в поддерживаемом браузере.</small>}</dd></div>)}</dl><p className="student-analytics__notice">Общие ориентиры: LCP ≤ 2,5 с, INP ≤ 200 мс, CLS ≤ 0,1. <a href="https://web.dev/articles/vitals" target="_blank" rel="noopener noreferrer">Описание Core Web Vitals</a>. При малой выборке оценка качества не выставляется.</p></details></section>
}
