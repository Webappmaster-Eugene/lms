import Link from 'next/link'

import { formatRubles } from '@/lib/bootcamp-admission'
import { actionReasonLabel, FUNNEL_PERIODS, formatDuration, type FunnelFilter } from '@/lib/bootcamp-funnel'
import type { FunnelReport } from '@/server/bootcamp-funnel'
import './bootcamp-funnel.scss'

const dateTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
const at = (value: string | null) => value ? dateTime.format(new Date(value)) : 'без даты'
const share = (value: number | null) => value === null ? 'нет данных' : `${value} %`

type Props = { report: FunnelReport, filter: FunnelFilter, action: string }

export function BootcampFunnelReport({ report, filter, action }: Props) {
  const [leads, ...rest] = report.steps
  const paid = report.steps.find((step) => step.key === 'paid')
  const sourceOptions = report.sources.some((item) => item.key === filter.source) || !filter.source
    ? report.sources
    : [...report.sources, { key: filter.source, label: filter.source, leads: 0, submitted: 0, admitted: 0, paid: 0, enrolled: 0 }]
  return (
    <div className="bootcamp-funnel">
      <header>
        <h1>Воронка буткемпа</h1>
        <p>Заявки, пришедшие за выбранный период, и сколько из них дошло до каждого шага. Деньги считаются по дате оплаты. Тестовые оплаты Робокассы не учитываются.</p>
      </header>

      <form className="bootcamp-funnel__filter" method="get" action={action}>
        <label>Период
          <select name="period" defaultValue={filter.period}>
            {FUNNEL_PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Источник
          <select name="source" defaultValue={filter.source ?? ''}>
            <option value="">Все источники</option>
            {sourceOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <button type="submit">Показать</button>
      </form>

      <dl className="bootcamp-funnel__summary">
        <div><dt>Заявок за период</dt><dd>{leads.count}</dd></div>
        <div><dt>Оплатили</dt><dd>{paid?.count ?? 0}</dd><small>{share(paid?.fromLeads ?? null)} от заявок</small></div>
        <div><dt>Оплачено за период</dt><dd>{formatRubles(report.revenue.kopecks)}</dd><small>оплат: {report.revenue.payments}</small></div>
        <div><dt>Средний результат входного задания</dt><dd>{report.entryScore === null ? 'нет данных' : `${Math.round(report.entryScore * 100)} %`}</dd><small>доля пройденных тестов</small></div>
      </dl>

      <section className="bootcamp-funnel__section" aria-labelledby="funnel-steps">
        <h2 id="funnel-steps">Шаги</h2>
        {leads.count === 0 ? <p>За этот период заявок нет. Выберите период длиннее или другой источник.</p> : (
          <table className="bootcamp-funnel__table">
            <thead><tr><th scope="col">Шаг</th><th scope="col">Дошли</th><th scope="col">От прошлого шага</th><th scope="col">От всех заявок</th><th scope="col">Обычно занимает</th></tr></thead>
            <tbody>
              <tr><th scope="row">{leads.label}</th><td><Bar value={100} />{leads.count}</td><td /><td /><td /></tr>
              {rest.map((step) => (
                <tr key={step.key}>
                  <th scope="row">{step.label}</th>
                  <td><Bar value={step.fromLeads ?? 0} />{step.count}</td>
                  <td>{share(step.fromPrevious)}</td>
                  <td>{share(step.fromLeads)}</td>
                  <td>{step.count > 0 ? formatDuration(step.median) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="bootcamp-funnel__notice">«Обычно занимает» - медиана времени от прошлого шага у тех, кто прошёл оба. Первый MR считается по событиям GitLab с 31 октября 2026 года, раньше они не записывались.</p>
      </section>

      <section className="bootcamp-funnel__section" aria-labelledby="funnel-sources">
        <h2 id="funnel-sources">Откуда пришли</h2>
        {report.sources.length === 0 ? <p>Заявок за период нет.</p> : (
          <table className="bootcamp-funnel__table">
            <thead><tr><th scope="col">Источник</th><th scope="col">Заявки</th><th scope="col">Решения</th><th scope="col">Допущены</th><th scope="col">Оплатили</th><th scope="col">Зачислены</th></tr></thead>
            <tbody>
              {report.sources.map((item) => (
                <tr key={item.key}><th scope="row">{item.label}</th><td>{item.leads}</td><td>{item.submitted}</td><td>{item.admitted}</td><td>{item.paid}</td><td>{item.enrolled}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="bootcamp-funnel__notice">Источник - метка utm_source из адреса страницы, без неё сайт, с которого перешли. Фильтр по источнику на эту таблицу не влияет.</p>
      </section>

      <section className="bootcamp-funnel__section" aria-labelledby="funnel-queue">
        <h2 id="funnel-queue">Ждут вашего действия</h2>
        {report.queue.length === 0 ? <p>Сейчас таких заявок нет.</p> : (
          <>
            <ul className="bootcamp-funnel__queue">
              {report.queue.map((item) => (
                <li key={item.id}>
                  <Link href={`/admin/collections/bootcamp-leads/${item.id}`}>{item.name ? `${item.name}, ${item.email}` : item.email}</Link>
                  <span>{actionReasonLabel(item.reason)}, с {at(item.since)}</span>
                </li>
              ))}
            </ul>
            {report.queueTotal > report.queue.length && <p className="bootcamp-funnel__notice">Всего таких заявок {report.queueTotal}, здесь самые давние {report.queue.length}.</p>}
          </>
        )}
        <p className="bootcamp-funnel__notice">Список не зависит от периода и источника: в нём все заявки, где следующий шаг за командой.</p>
      </section>
    </div>
  )
}

function Bar({ value }: { value: number }) {
  return <span className="bootcamp-funnel__bar" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></span>
}
