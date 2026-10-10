import type { BrowserCheck, RuntimeCase } from '@/lib/trainer/runtime-spec'
import type { TrainerTaskSeed, TrainerTopicSeed } from './types'

const styles = `* { box-sizing: border-box; }
body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; color: #172033; background: #f8fafc; }
main { max-width: 760px; margin: auto; }
button, input, textarea { font: inherit; min-height: 44px; padding: 8px 12px; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .55; }
label { display: block; margin-top: 12px; }
input, textarea { max-width: 100%; }
ul { padding-left: 24px; }
li { margin: 12px 0; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
[aria-selected="true"], [aria-pressed="true"] { font-weight: 700; background: #dbeafe; }
:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
dialog { max-width: min(560px, 90vw); border: 1px solid #94a3b8; border-radius: 8px; }
dialog::backdrop { background: #17203399; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 8px; text-align: left; border-bottom: 1px solid #cbd5e1; }
[role="alert"] { color: #b91c1c; }
`

const click = (selector: string): BrowserCheck => ({ selector, action: 'click' })
const press = (selector: string, value: 'Enter' | 'Escape' | 'Space' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'): BrowserCheck => ({ selector, action: 'press', value })
const fill = (selector: string, value: string): BrowserCheck => ({ selector, action: 'fill', value })
const text = (selector: string, value: string): BrowserCheck => ({ selector, text: value })
const count = (selector: string, value: number): BrowserCheck => ({ selector, count: value })
const attr = (selector: string, name: string, value: string): BrowserCheck => ({ selector, attribute: { name, value } })
const visible = (selector: string, value = true): BrowserCheck => ({ selector, visible: value })
const scenario = (name: string, hidden: boolean, checks: BrowserCheck[]): RuntimeCase => ({ name, hidden, checks })
const project = (app: string): Record<string, string> => ({ 'App.tsx': app, 'styles.css': styles })

type ReactInterviewTask = Omit<TrainerTaskSeed, 'languages' | 'checkMode' | 'starterCode' | 'solutionCode' | 'starterFiles' | 'solutionFiles' | 'wrongSolution'> & {
  starter: string
  solution: string
  incorrect: string
  recommendedMinutes: number
}

function task({ starter, solution, incorrect, ...data }: ReactInterviewTask): TrainerTaskSeed {
  const starterFiles = project(starter)
  const solutionFiles = project(solution)
  return {
    ...data,
    interviewFormat: 'frontend',
    companyEvidence: [],
    companies: [],
    languages: ['react'],
    checkMode: 'dom',
    timeLimitMs: 5000,
    starterFiles,
    solutionFiles,
    starterCode: JSON.stringify(starterFiles),
    solutionCode: JSON.stringify(solutionFiles),
    wrongSolution: JSON.stringify(project(incorrect)),
  }
}

const todoSolution = `import { useRef, useState } from 'react'
import './styles.css'

type Todo = { id: number; title: string; done: boolean }
type Filter = 'all' | 'active' | 'done'
const initial: Todo[] = [
  { id: 1, title: 'Повторить хуки', done: false },
  { id: 2, title: 'Открыть редактор', done: true },
]
export default function App() {
  const [items, setItems] = useState(initial)
  const [title, setTitle] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const nextId = useRef(3)
  const shown = items.filter(item => filter === 'all' || (filter === 'done' ? item.done : !item.done))
  function add() {
    if (!title.trim()) return
    const id = nextId.current++
    setItems(previous => [...previous, { id, title: title.trim(), done: false }])
    setTitle('')
  }
  function save() {
    if (editing === null || !draft.trim()) return
    setItems(previous => previous.map(item => item.id === editing ? { ...item, title: draft.trim() } : item))
    setEditing(null)
  }
  return <main>
    <h1>План подготовки</h1>
    <form onSubmit={event => { event.preventDefault(); add() }}>
      <label htmlFor="new-title">Новая задача</label>
      <input id="new-title" value={title} onChange={event => setTitle(event.target.value)} />
      <button id="add" type="submit">Добавить</button>
    </form>
    <div className="controls">{(['all', 'active', 'done'] as const).map(value =>
      <button key={value} id={'filter-' + value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'Все' : value === 'active' ? 'Активные' : 'Готовые'}</button>
    )}</div>
    <output id="remaining" aria-live="polite">{items.filter(item => !item.done).length}</output>
    <ul id="todos">{shown.map(item => <li key={item.id} data-id={item.id}>
      <input type="checkbox" aria-label={'Готово: ' + item.title} checked={item.done} onChange={() => setItems(previous => previous.map(todo => todo.id === item.id ? { ...todo, done: !todo.done } : todo))} />
      <span className="title">{item.title}</span>
      <button className="edit" type="button" onClick={() => { setEditing(item.id); setDraft(item.title) }}>Изменить</button>
      <button className="delete" type="button" onClick={() => setItems(previous => previous.filter(todo => todo.id !== item.id))}>Удалить</button>
    </li>)}</ul>
    {shown.length === 0 && <p id="empty">Нет задач</p>}
    {editing !== null && <section aria-label="Редактирование задачи">
      <label htmlFor="edit-title">Текст задачи</label>
      <input id="edit-title" value={draft} onChange={event => setDraft(event.target.value)} />
      <button id="save-edit" type="button" onClick={save}>Сохранить</button>
      <button id="cancel-edit" type="button" onClick={() => setEditing(null)}>Отмена</button>
    </section>}
  </main>
}`

const tabsSolution = `import { useRef, useState } from 'react'
import './styles.css'
const items = [
  { label: 'Обзор', content: 'Основные сведения' },
  { label: 'Практика', content: 'Решаем задачи' },
  { label: 'Материалы', content: 'Ссылки и записи' },
]
function Tabs({ prefix, initialIndex }: { prefix: string; initialIndex: number }) {
  const [selected, setSelected] = useState(initialIndex)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  function activate(index: number) {
    setSelected(index)
    refs.current[index]?.focus()
  }
  return <section id={prefix} aria-label={prefix === 'first' ? 'Первая группа' : 'Вторая группа'}>
    <div role="tablist" aria-label="Разделы">{items.map((item, index) => <button
      key={item.label} id={prefix + '-tab-' + index} ref={node => { refs.current[index] = node }}
      type="button" role="tab" aria-selected={selected === index} aria-controls={prefix + '-panel-' + index} tabIndex={selected === index ? 0 : -1}
      onClick={() => setSelected(index)}
      onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (selected + 1) % items.length : event.key === 'ArrowLeft' ? (selected + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null
        if (next !== null) { event.preventDefault(); activate(next) }
      }}
    >{item.label}</button>)}</div>
    {items.map((item, index) => <div key={item.label} id={prefix + '-panel-' + index} role="tabpanel" tabIndex={0} aria-labelledby={prefix + '-tab-' + index} hidden={selected !== index}>{item.content}</div>)}
  </section>
}
export default function App() {
  return <main><h1>Разделы курса</h1><Tabs prefix="first" initialIndex={0} /><Tabs prefix="second" initialIndex={1} /></main>
}`

const directorySolution = `import { useState } from 'react'
import './styles.css'
const people = [
  { id: 'anna', name: 'Анна', skill: 'React' },
  { id: 'boris', name: 'Борис', skill: 'Go' },
  { id: 'vera', name: 'Вера', skill: 'React' },
  { id: 'gleb', name: 'Глеб', skill: 'Python' },
]
export default function App() {
  const [query, setQuery] = useState('')
  const [reverse, setReverse] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const normalized = query.trim().toLowerCase()
  const matches = people.filter(person => (person.name + ' ' + person.skill).toLowerCase().includes(normalized))
  const shown = reverse ? [...matches].reverse() : matches
  function toggle(id: string) {
    setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id])
  }
  return <main>
    <h1>Команда проекта</h1>
    <label htmlFor="query">Имя или навык</label>
    <input id="query" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="controls">
      <button id="reverse" type="button" aria-pressed={reverse} onClick={() => setReverse(value => !value)}>Обратный порядок</button>
      <button id="clear-query" type="button" onClick={() => setQuery('')}>Очистить поиск</button>
    </div>
    <output id="selected-count" aria-live="polite">{selected.length}</output>
    <ul id="people">{shown.map(person => <li key={person.id} data-id={person.id}>
      <span className="name">{person.name}</span>: <span className="skill">{person.skill}</span>
      <button className="select" type="button" aria-pressed={selected.includes(person.id)} onClick={() => toggle(person.id)}>Выбрать</button>
    </li>)}</ul>
    {shown.length === 0 && <p id="empty">Никого не нашли</p>}
  </main>
}`

const paginationSolution = `import { useState } from 'react'
import './styles.css'
const records = [
  { id: 1, name: 'Анна', active: true }, { id: 2, name: 'Борис', active: false },
  { id: 3, name: 'Вера', active: true }, { id: 4, name: 'Глеб', active: false },
  { id: 5, name: 'Дина', active: true }, { id: 6, name: 'Егор', active: false },
  { id: 7, name: 'Жанна', active: true },
]
export default function App() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(2)
  const [onlyActive, setOnlyActive] = useState(false)
  const filtered = records.filter(record => !onlyActive || record.active)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize)
  return <main>
    <h1>Участники</h1>
    <label><input id="active-only" type="checkbox" checked={onlyActive} onChange={event => { setOnlyActive(event.target.checked); setPage(1) }} /> Только активные</label>
    <div className="controls">
      <button id="size-2" type="button" aria-pressed={pageSize === 2} onClick={() => { setPageSize(2); setPage(1) }}>По 2</button>
      <button id="size-4" type="button" aria-pressed={pageSize === 4} onClick={() => { setPageSize(4); setPage(1) }}>По 4</button>
    </div>
    <table><caption>Список участников</caption><thead><tr><th scope="col">ID</th><th scope="col">Имя</th></tr></thead>
      <tbody id="rows">{shown.map(record => <tr key={record.id} data-id={record.id}><td>{record.id}</td><td className="name">{record.name}</td></tr>)}</tbody>
    </table>
    <output id="page-status" aria-live="polite">{page + '/' + totalPages}</output>
    <div className="controls">
      <button id="previous" type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Назад</button>
      <button id="next" type="button" disabled={page === totalPages} onClick={() => setPage(value => value + 1)}>Вперёд</button>
    </div>
  </main>
}`

const formSolution = `import { useState } from 'react'
import './styles.css'
function emailValid(value: string) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value) }
export default function App() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState('')
  function submit() {
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Введите имя от 2 символов'
    if (!emailValid(email.trim())) next.email = 'Введите корректный e-mail'
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\\d/.test(password)) next.password = 'Не менее 8 символов, буква и цифра'
    if (!consent) next.consent = 'Нужно согласие'
    setErrors(next)
    setSubmitted(Object.keys(next).length === 0 ? name.trim() + ': ' + email.trim().toLowerCase() : '')
  }
  function reset() {
    setName(''); setEmail(''); setPassword(''); setConsent(false); setErrors({}); setSubmitted('')
  }
  return <main>
    <h1>Заявка на участие</h1>
    <form noValidate onSubmit={event => { event.preventDefault(); submit() }} onChange={() => setSubmitted('')}>
      <label htmlFor="name">Имя</label><input id="name" value={name} aria-invalid={Boolean(errors.name)} aria-describedby="name-error" onChange={event => setName(event.target.value)} />
      <p id="name-error" role="alert">{errors.name ?? ''}</p>
      <label htmlFor="email">E-mail</label><input id="email" type="email" value={email} aria-invalid={Boolean(errors.email)} aria-describedby="email-error" onChange={event => setEmail(event.target.value)} />
      <p id="email-error" role="alert">{errors.email ?? ''}</p>
      <label htmlFor="password">Пароль</label><input id="password" type="password" value={password} aria-invalid={Boolean(errors.password)} aria-describedby="password-error" onChange={event => setPassword(event.target.value)} />
      <p id="password-error" role="alert">{errors.password ?? ''}</p>
      <label><input id="consent" type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Согласен с условиями</label>
      <p id="consent-error" role="alert">{errors.consent ?? ''}</p>
      <div className="controls"><button id="submit" type="submit">Отправить</button><button id="reset" type="button" onClick={reset}>Очистить</button></div>
    </form>
    {submitted && <output id="success" aria-live="polite">{submitted}</output>}
  </main>
}`

const modalSolution = `import { useEffect, useRef, useState } from 'react'
import './styles.css'
export default function App() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('Первая заметка')
  const [draft, setDraft] = useState('Первая заметка')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) { dialog.close(); openerRef.current?.focus() }
  }, [open])
  return <main>
    <h1>Заметка к интервью</h1>
    <p id="saved-note">{saved}</p>
    <button id="open-modal" type="button" ref={openerRef} onClick={() => { setDraft(saved); setOpen(true) }}>Редактировать заметку</button>
    <dialog id="note-dialog" ref={dialogRef} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); setOpen(false) }}>
      <h2 id="dialog-title">Редактирование заметки</h2>
      <label htmlFor="note">Заметка</label><input id="note" autoFocus value={draft} onChange={event => setDraft(event.target.value)} />
      <output id="draft-preview">{draft}</output>
      <div className="controls">
        <button id="save-note" type="button" disabled={!draft.trim()} onClick={() => { setSaved(draft.trim()); setOpen(false) }}>Сохранить</button>
        <button id="cancel-note" type="button" onClick={() => setOpen(false)}>Отмена</button>
      </div>
    </dialog>
  </main>
}`

const accordionSolution = `import { useState } from 'react'
import './styles.css'
const sections = [
  { id: 'state', title: 'Состояние', content: 'Храните изменяющиеся данные в состоянии.' },
  { id: 'props', title: 'Пропсы', content: 'Передавайте данные от родителя к ребёнку.' },
  { id: 'effects', title: 'Эффекты', content: 'Синхронизируйте компонент с внешней системой.' },
]
export default function App() {
  const [opened, setOpened] = useState<string[]>([])
  return <main>
    <h1>Памятка React</h1>
    {sections.map(section => <section key={section.id}>
      <h2><button id={'trigger-' + section.id} type="button" aria-expanded={opened.includes(section.id)} aria-controls={'panel-' + section.id}
        onClick={() => setOpened(previous => previous.includes(section.id) ? previous.filter(id => id !== section.id) : [...previous, section.id])}>{section.title}</button></h2>
      <div id={'panel-' + section.id} role="region" aria-labelledby={'trigger-' + section.id} hidden={!opened.includes(section.id)}>{section.content}</div>
    </section>)}
    <button id="close-all" type="button" onClick={() => setOpened([])}>Закрыть всё</button>
  </main>
}`

const cartSolution = `import { useState } from 'react'
import './styles.css'
const products = [
  { id: 'book', title: 'Книга', price: 400, stock: 3 },
  { id: 'pen', title: 'Ручка', price: 100, stock: 5 },
]
export default function App() {
  const [quantities, setQuantities] = useState<Record<string, number>>({ book: 0, pen: 0 })
  const subtotal = products.reduce((sum, product) => sum + product.price * quantities[product.id], 0)
  const units = Object.values(quantities).reduce((sum, value) => sum + value, 0)
  const discount = subtotal >= 1000 ? subtotal / 10 : 0
  function change(id: string, delta: number, stock: number) {
    setQuantities(previous => ({ ...previous, [id]: Math.max(0, Math.min(stock, previous[id] + delta)) }))
  }
  return <main>
    <h1>Корзина для подготовки</h1>
    <ul id="products">{products.map(product => <li key={product.id} data-id={product.id}>
      <span>{product.title}: {product.price} ₽</span>
      <output className="quantity">{quantities[product.id]}</output>
      <button className="minus" type="button" aria-label={'Уменьшить: ' + product.title} disabled={quantities[product.id] === 0} onClick={() => change(product.id, -1, product.stock)}>−</button>
      <button className="plus" type="button" aria-label={'Увеличить: ' + product.title} disabled={quantities[product.id] === product.stock} onClick={() => change(product.id, 1, product.stock)}>+</button>
      <button className="remove" type="button" onClick={() => setQuantities(previous => ({ ...previous, [product.id]: 0 }))}>Убрать</button>
    </li>)}</ul>
    <dl><dt>Товаров</dt><dd id="units">{units}</dd><dt>Сумма до скидки</dt><dd id="subtotal">{subtotal}</dd><dt>Скидка</dt><dd id="discount">{discount}</dd><dt>К оплате</dt><dd id="total" aria-live="polite">{subtotal - discount}</dd></dl>
  </main>
}`

const starter = (heading: string, markup: string): string => `import './styles.css'

export default function App() {
  // Реализуйте состояние и обработчики, сохраняя указанные в условии селекторы.
  return <main><h1>${heading}</h1>${markup}</main>
}`

export const reactInterviewTopic: TrainerTopicSeed = {
  slug: 'react-live-coding-interviews',
  title: 'React: live coding на интервью',
  description: 'Состояние, формы, списки и доступные компоненты: самостоятельные задачи для практики интервью',
  category: 'frontend',
  icon: '⚛️',
  order: 23,
  tasks: [
    task({
      slug: 'react-interview-todo-crud',
      title: 'React: план подготовки с фильтрами и редактированием',
      difficulty: 'medium',
      recommendedMinutes: 35,
      tags: ['react', 'hooks', 'state', 'arrays', 'forms'],
      sourceUrl: 'https://www.greatfrontend.com/questions/user-interface/todo-list',
      descriptionMd: `Сделайте план подготовки в App.tsx (default export App). Это авторская расширенная задача на состояние и CRUD: данные остаются только в памяти, внешние запросы не нужны.

Начальные записи в порядке отображения: id=1 «Повторить хуки» (активная), id=2 «Открыть редактор» (готовая).

Требования:
- input#new-title с label «Новая задача» и button#add добавляют trimmed-текст в конец списка. Пробелы без текста игнорируются, успешное добавление очищает поле. Одинаковые названия разрешены и обозначают разные записи. Новые id начинаются с 3 и возрастают, удалённые id не используются заново.
- ul#todos содержит li[data-id]. Название — span.title. checkbox изменяет готовность; button.edit открывает редактор этой записи, button.delete удаляет только эту запись.
- Кнопки #filter-all, #filter-active, #filter-done показывают все/активные/готовые записи без изменения данных. aria-pressed отмечает выбранный фильтр. Порядок записей сохраняется.
- output#remaining содержит число активных записей во всём плане, включая скрытые фильтром. Пустой видимый список показывает p#empty «Нет задач».
- Редактор содержит input#edit-title и кнопки #save-edit/#cancel-edit. Сохранение trimmed-непустого текста меняет название, сохраняет id и готовность и закрывает редактор. Пустой текст не сохраняется. Отмена не меняет запись.

Сохраните селекторы для браузерных проверок. Не используйте dangerouslySetInnerHTML: текст задачи должен оставаться текстом. Источник подтверждает тип упражнения Todo List, а не использование этой авторской версии конкретной компанией.`,
      starter: starter('План подготовки', '<label htmlFor="new-title">Новая задача</label><input id="new-title" /><button id="add" type="button">Добавить</button><div className="controls"><button id="filter-all" type="button">Все</button><button id="filter-active" type="button">Активные</button><button id="filter-done" type="button">Готовые</button></div><output id="remaining">1</output><ul id="todos"><li data-id="1"><span className="title">Повторить хуки</span><input type="checkbox" /><button className="edit" type="button">Изменить</button><button className="delete" type="button">Удалить</button></li><li data-id="2"><span className="title">Открыть редактор</span><input type="checkbox" defaultChecked /><button className="edit" type="button">Изменить</button><button className="delete" type="button">Удалить</button></li></ul>'),
      solution: todoSolution,
      incorrect: todoSolution.replace('todo.id !== item.id', 'todo.title !== item.title'),
      solutionNotes: 'Идентификатор принадлежит записи, а не её названию или позиции. Фильтр — отдельное состояние; видимый список и количество активных задач вычисляются из полного массива. Черновик редактирования не меняет исходную запись до сохранения.',
      hints: ['Храните записи с id, title и done. Новый id удобно выдавать через useRef.', 'Отфильтруйте массив для отображения, но считайте remaining до фильтра.', 'Удаляйте и редактируйте по id, а не по индексу или названию.'],
      runtimeCases: [
        scenario('Добавление и очистка поля', false, [count('#todos > li', 2), fill('#new-title', '  Разобрать замыкания  '), click('#add'), count('#todos > li', 3), text('#todos > li[data-id="3"] .title', 'Разобрать замыкания'), text('#remaining', '2'), click('#add'), count('#todos > li', 3)]),
        scenario('Фильтры и готовность', false, [click('#filter-active'), count('#todos > li', 1), attr('#filter-active', 'aria-pressed', 'true'), click('#todos > li[data-id="1"] input'), count('#todos > li', 0), text('#empty', 'Нет задач'), text('#remaining', '0'), click('#filter-done'), count('#todos > li', 2)]),
        scenario('Одинаковые названия — независимые записи', true, [fill('#new-title', 'Дубликат'), click('#add'), fill('#new-title', 'Дубликат'), click('#add'), click('#todos > li[data-id="3"] .delete'), count('#todos > li[data-id="3"]', 0), text('#todos > li[data-id="4"] .title', 'Дубликат'), count('#todos > li', 3), fill('#new-title', 'Новая'), click('#add'), text('#todos > li[data-id="5"] .title', 'Новая'), click('#todos > li[data-id="5"] .delete'), fill('#new-title', 'Ещё одна'), click('#add'), text('#todos > li[data-id="6"] .title', 'Ещё одна')]),
        scenario('Редактирование и отмена сохраняют готовность', true, [click('#todos > li[data-id="2"] .edit'), fill('#edit-title', 'Черновик'), click('#cancel-edit'), text('#todos > li[data-id="2"] .title', 'Открыть редактор'), click('#todos > li[data-id="2"] .edit'), fill('#edit-title', '  Настроить окружение  '), click('#save-edit'), text('#todos > li[data-id="2"] .title', 'Настроить окружение'), click('#filter-done'), count('#todos > li', 1), text('#todos > li[data-id="2"] .title', 'Настроить окружение'), text('#remaining', '1')]),
        scenario('Пустой ввод и безопасный текст', true, [fill('#new-title', '   '), click('#add'), count('#todos > li', 2), fill('#new-title', '<b>Проверка</b>'), click('#add'), text('#todos > li[data-id="3"] .title', '<b>Проверка</b>'), count('#todos > li[data-id="3"] b', 0), click('#todos > li[data-id="3"] .edit'), fill('#edit-title', '  '), click('#save-edit'), count('#edit-title', 1), text('#todos > li[data-id="3"] .title', '<b>Проверка</b>')]),
      ],
    }),
    task({
      slug: 'react-interview-accessible-tabs',
      title: 'React: независимые вкладки с управлением клавиатурой',
      difficulty: 'medium',
      recommendedMinutes: 30,
      tags: ['react', 'state', 'accessibility'],
      sourceUrl: 'https://www.greatfrontend.com/questions/user-interface/tabs',
      descriptionMd: `Реализуйте два независимых экземпляра Tabs в App.tsx. В каждом три вкладки: «Обзор», «Практика», «Материалы» с панелями «Основные сведения», «Решаем задачи», «Ссылки и записи».

Первая группа id=first изначально выбирает индекс 0, вторая id=second — индекс 1. Используйте параметр initialIndex и отдельное состояние экземпляра.

Требования:
- Кнопки имеют id вида first-tab-0/second-tab-1 и role="tab". Контейнер имеет role="tablist". Панели имеют id first-panel-0 и т. д., role="tabpanel", tabIndex=0, aria-labelledby с id своей кнопки.
- aria-controls кнопки ссылается на её панель. aria-selected равен true только у выбранной вкладки, tabIndex=0 только у неё; у остальных -1.
- В каждой группе видна ровно одна панель. Сохраняйте остальные панели в DOM с hidden. Клик меняет только свою группу.
- ArrowRight/ArrowLeft циклически выбирают соседнюю вкладку. Home выбирает первую, End — последнюю. Выбор и фокус меняются вместе, браузерная прокрутка по этим клавишам предотвращается.

Нативная кнопка обеспечивает Enter и пробел. Не объединяйте состояние двух групп в глобальную переменную. Наши условия расширяют тип задания Tabs; компании не приписываются без публичного подтверждения.`,
      starter: starter('Разделы курса', '<section id="first"><div role="tablist"><button id="first-tab-0" type="button" role="tab">Обзор</button><button id="first-tab-1" type="button" role="tab">Практика</button><button id="first-tab-2" type="button" role="tab">Материалы</button></div><div id="first-panel-0" role="tabpanel">Основные сведения</div><div id="first-panel-1" role="tabpanel">Решаем задачи</div><div id="first-panel-2" role="tabpanel">Ссылки и записи</div></section><section id="second"><div role="tablist"><button id="second-tab-0" type="button" role="tab">Обзор</button><button id="second-tab-1" type="button" role="tab">Практика</button><button id="second-tab-2" type="button" role="tab">Материалы</button></div><div id="second-panel-0" role="tabpanel">Основные сведения</div><div id="second-panel-1" role="tabpanel">Решаем задачи</div><div id="second-panel-2" role="tabpanel">Ссылки и записи</div></section>'),
      solution: tabsSolution,
      incorrect: tabsSolution.replace('useState(initialIndex)', 'useState(0)'),
      solutionNotes: 'Каждый Tabs хранит только индекс выбора. ARIA-связи строятся через уникальный prefix, а ссылки на кнопки позволяют переносить фокус после стрелок. Модульное или общее состояние нарушает независимость экземпляров.',
      hints: ['Передайте prefix и initialIndex в компонент и вызовите useState внутри каждого экземпляра.', 'Для циклического перехода используйте остаток от деления на количество вкладок.', 'После выбора клавиатурой сфокусируйте соответствующую кнопку через ref.'],
      runtimeCases: [
        scenario('Переключение первой группы', false, [visible('#first-panel-0'), visible('#first-panel-1', false), count('#first [role="tabpanel"]:not([hidden])', 1), click('#first-tab-2'), visible('#first-panel-2'), visible('#first-panel-0', false), attr('#first-tab-2', 'aria-selected', 'true'), attr('#first-tab-2', 'aria-controls', 'first-panel-2'), attr('#first-panel-2', 'aria-labelledby', 'first-tab-2'), attr('#first-panel-2', 'tabindex', '0'), count('#first [role="tabpanel"]:not([hidden])', 1), count('#first [role="tab"][aria-selected="true"]', 1)]),
        scenario('Начальный выбор и независимость групп', true, [visible('#second-panel-1'), attr('#second-tab-1', 'aria-selected', 'true'), click('#first-tab-1'), click('#second-tab-0'), visible('#first-panel-1'), visible('#second-panel-0'), attr('#first-tab-1', 'tabindex', '0'), attr('#first-tab-0', 'tabindex', '-1')]),
        scenario('Стрелки циклически перемещают выбор и фокус', true, [press('#first-tab-0', 'ArrowLeft'), visible('#first-panel-2'), count('#first-tab-2:focus', 1), press('#first-tab-2', 'ArrowRight'), visible('#first-panel-0'), count('#first-tab-0:focus', 1), visible('#second-panel-1')]),
        scenario('Home и End работают в своей группе', true, [press('#second-tab-1', 'End'), visible('#second-panel-2'), count('#second-tab-2:focus', 1), press('#second-tab-2', 'Home'), visible('#second-panel-0'), count('#second-tab-0:focus', 1), visible('#first-panel-0')]),
      ],
    }),
    task({
      slug: 'react-interview-directory-selection',
      title: 'React: поиск и выбор участников без потери состояния',
      difficulty: 'medium',
      recommendedMinutes: 30,
      tags: ['react', 'hooks', 'state', 'arrays'],
      sourceUrl: 'https://react.dev/learn/choosing-the-state-structure',
      descriptionMd: `Создайте каталог команды с поиском, обратным порядком и независимым выбором участников. В отличие от простого фильтра списка здесь выбранные записи должны переживать смену видимости и порядка.

Данные: anna — Анна/React; boris — Борис/Go; vera — Вера/React; gleb — Глеб/Python. Начальный порядок: Анна, Борис, Вера, Глеб. Все участники изначально не выбраны.

Требования:
- input#query с label «Имя или навык» фильтрует по подстроке имени или навыка, без учёта регистра и пробелов по краям запроса.
- ul#people содержит li[data-id], имя в span.name, навык в span.skill. button.select переключает выбор конкретного id и показывает его через aria-pressed.
- #reverse переключает обратный порядок отображения и свой aria-pressed. Поиск не сбрасывает этот выбор.
- #clear-query очищает только поиск. Пустой запрос возвращает все записи; при отсутствии совпадений список пуст и p#empty содержит «Никого не нашли».
- output#selected-count считает всех выбранных участников, включая скрытых фильтром. Поиск, сортировка и очистка не сбрасывают выбор. Повторный клик снимает выбор только с этой записи.

Не храните отдельные копии выбранных объектов и не привязывайте выбор к индексу видимого массива. Никаких запросов к API не требуется. Это авторское упражнение на принципы состояния из документации React, без привязки к конкретной компании.`,
      starter: starter('Команда проекта', '<label htmlFor="query">Имя или навык</label><input id="query" /><button id="reverse" type="button">Обратный порядок</button><button id="clear-query" type="button">Очистить поиск</button><output id="selected-count">0</output><ul id="people">{[{ id: "anna", name: "Анна", skill: "React" }, { id: "boris", name: "Борис", skill: "Go" }, { id: "vera", name: "Вера", skill: "React" }, { id: "gleb", name: "Глеб", skill: "Python" }].map(person => <li key={person.id} data-id={person.id}><span className="name">{person.name}</span>: <span className="skill">{person.skill}</span><button className="select" type="button">Выбрать</button></li>)}</ul>'),
      solution: directorySolution,
      incorrect: directorySolution.replace('setQuery(event.target.value)', '(setSelected([]), setQuery(event.target.value))'),
      solutionNotes: 'Состояние выбора — набор стабильных id. Фильтр и порядок меняют только представление, поэтому скрытые элементы сохраняют выбор. Количество выбранных вычисляется из набора id, а не из видимого списка.',
      hints: ['Храните query, порядок и выбранные id отдельно.', 'Сначала фильтруйте исходные данные, затем меняйте порядок копии результата.', 'Проверяйте выбор через id записи, не через её индекс в отфильтрованном массиве.'],
      runtimeCases: [
        scenario('Поиск по навыку и пустой результат', false, [fill('#query', ' rEaCt '), count('#people > li', 2), text('#people > li:nth-child(1) .name', 'Анна'), text('#people > li:nth-child(2) .name', 'Вера'), fill('#query', 'нет такого'), count('#people > li', 0), text('#empty', 'Никого не нашли')]),
        scenario('Выбор и снятие выбора', false, [click('#people > li[data-id="boris"] .select'), text('#selected-count', '1'), attr('#people > li[data-id="boris"] .select', 'aria-pressed', 'true'), click('#people > li[data-id="boris"] .select'), text('#selected-count', '0'), attr('#people > li[data-id="boris"] .select', 'aria-pressed', 'false')]),
        scenario('Скрытые участники остаются выбранными', true, [click('#people > li[data-id="anna"] .select'), click('#people > li[data-id="gleb"] .select'), fill('#query', 'Go'), count('#people > li', 1), text('#selected-count', '2'), click('#clear-query'), count('#people > li', 4), attr('#people > li[data-id="anna"] .select', 'aria-pressed', 'true'), attr('#people > li[data-id="gleb"] .select', 'aria-pressed', 'true')]),
        scenario('Обратный порядок не переставляет выбор', true, [click('#people > li[data-id="anna"] .select'), click('#reverse'), text('#people > li:nth-child(1) .name', 'Глеб'), text('#people > li:nth-child(4) .name', 'Анна'), fill('#query', 'react'), text('#people > li:nth-child(1) .name', 'Вера'), attr('#people > li[data-id="anna"] .select', 'aria-pressed', 'true'), click('#clear-query'), text('#people > li:nth-child(1) .name', 'Глеб'), click('#reverse'), text('#people > li:nth-child(1) .name', 'Анна')]),
        scenario('Поиск по имени и сброс только запроса', true, [fill('#query', '  ГЛ  '), text('#people > li .name', 'Глеб'), count('#people > li', 1), click('#people > li[data-id="gleb"] .select'), click('#clear-query'), count('#people > li', 4), count('#empty', 0), text('#selected-count', '1')]),
      ],
    }),
    task({
      slug: 'react-interview-pagination',
      title: 'React: таблица с пагинацией и изменением набора данных',
      difficulty: 'medium',
      recommendedMinutes: 30,
      tags: ['react', 'state', 'arrays', 'accessibility'],
      sourceUrl: 'https://www.greatfrontend.com/questions/user-interface/data-table',
      descriptionMd: `Реализуйте таблицу участников с пагинацией. Исходные записи: 1 Анна (активная), 2 Борис (неактивный), 3 Вера (активная), 4 Глеб (неактивный), 5 Дина (активная), 6 Егор (неактивный), 7 Жанна (активная).

Требования:
- Таблица имеет caption «Список участников», столбцы ID/Имя с th[scope="col"]. tbody#rows содержит tr[data-id] и td.name. Сохраняйте исходный порядок.
- Изначально страница 1 и размер 2. #previous/#next перемещают по страницам и disabled на соответствующей границе. output#page-status имеет точный формат текущая/всего, например 1/4.
- #size-2/#size-4 выбирают размер страницы, отмечают его через aria-pressed и всегда возвращают страницу 1.
- checkbox#active-only с подписью «Только активные» оставляет только активных участников и тоже возвращает страницу 1. Обратное переключение возвращает полный набор, сохраняя размер страницы.
- Последняя страница может содержать меньше записей; не добавляйте заполнители и не теряйте последнюю запись.

Выводимая страница и число страниц вычисляются из текущего фильтра и размера. Сервер и внешние библиотеки не нужны. Условие — самостоятельная адаптация распространённого задания Data Table, без неподтверждённых тегов компаний.`,
      starter: starter('Участники', '<label><input id="active-only" type="checkbox" /> Только активные</label><button id="size-2" type="button">По 2</button><button id="size-4" type="button">По 4</button><table><caption>Список участников</caption><thead><tr><th scope="col">ID</th><th scope="col">Имя</th></tr></thead><tbody id="rows"><tr data-id="1"><td>1</td><td className="name">Анна</td></tr><tr data-id="2"><td>2</td><td className="name">Борис</td></tr></tbody></table><output id="page-status">1/4</output><button id="previous" type="button" disabled>Назад</button><button id="next" type="button">Вперёд</button>'),
      solution: paginationSolution,
      incorrect: paginationSolution.replace('setPageSize(4); setPage(1)', 'setPageSize(4)'),
      solutionNotes: 'Храните только выбор пользователя: страницу, размер и фильтр. Для отображения используйте slice после фильтрации. Явный сброс на страницу 1 при изменении размера или фильтра предотвращает пустую страницу и противоречивый счётчик.',
      hints: ['Номер страницы начинается с 1; начало slice — (page - 1) * pageSize.', 'Число страниц — Math.ceil(filtered.length / pageSize).', 'Изменение размера/фильтра должно обновлять и номер страницы.'],
      runtimeCases: [
        scenario('Первая и следующая страницы', false, [text('#page-status', '1/4'), attr('#previous', 'disabled', ''), count('#rows > tr', 2), text('#rows > tr:nth-child(1) .name', 'Анна'), click('#next'), text('#page-status', '2/4'), text('#rows > tr:nth-child(1) .name', 'Вера'), count('#previous:not([disabled])', 1)]),
        scenario('Последняя неполная страница и возврат', true, [click('#next'), click('#next'), click('#next'), text('#page-status', '4/4'), count('#rows > tr', 1), text('#rows > tr .name', 'Жанна'), attr('#next', 'disabled', ''), click('#previous'), text('#page-status', '3/4'), count('#rows > tr', 2)]),
        scenario('Размер сбрасывает страницу и сохраняет хвост', true, [click('#next'), click('#next'), click('#size-4'), text('#page-status', '1/2'), attr('#size-4', 'aria-pressed', 'true'), count('#rows > tr', 4), text('#rows > tr:nth-child(1) .name', 'Анна'), click('#next'), count('#rows > tr', 3), text('#rows > tr:nth-child(3) .name', 'Жанна'), attr('#next', 'disabled', '')]),
        scenario('Фильтр применяется до пагинации', false, [click('#next'), click('#active-only'), text('#page-status', '1/2'), text('#rows > tr:nth-child(1) .name', 'Анна'), text('#rows > tr:nth-child(2) .name', 'Вера'), click('#next'), text('#rows > tr:nth-child(1) .name', 'Дина'), text('#rows > tr:nth-child(2) .name', 'Жанна'), attr('#next', 'disabled', '')]),
        scenario('Снятие фильтра сохраняет размер и семантику', true, [click('#size-4'), click('#active-only'), text('#page-status', '1/1'), attr('#next', 'disabled', ''), click('#active-only'), text('#page-status', '1/2'), count('#rows > tr', 4), attr('#size-4', 'aria-pressed', 'true'), count('table caption', 1), count('thead th[scope="col"]', 2)]),
      ],
    }),
    task({
      slug: 'react-interview-validated-form',
      title: 'React: форма с проверками и исправлением ошибок',
      difficulty: 'medium',
      recommendedMinutes: 35,
      tags: ['react', 'state', 'forms', 'accessibility'],
      sourceUrl: 'https://www.greatfrontend.com/questions/user-interface/signup-form',
      descriptionMd: `Сделайте форму заявки в App.tsx. Здесь нет реальной регистрации или API: успешную отправку представляет строка подтверждения в DOM.

Поля: #name «Имя», #email «E-mail» (type=email), #password «Пароль» (type=password), checkbox#consent «Согласен с условиями». Каждое поле имеет label; #submit отправляет, #reset очищает форму. Для собственных сообщений используйте form noValidate.

Требования после нажатия «Отправить»:
- Имя после trim должно иметь не менее 2 символов; ошибка p#name-error: «Введите имя от 2 символов».
- E-mail после trim имеет непустые части до/после @ и точку внутри домена; пробелы и дополнительные @ недопустимы. Ошибка #email-error: «Введите корректный e-mail».
- Пароль содержит не менее 8 символов, хотя бы одну латинскую букву и цифру; не обрезайте его пробелы автоматически. Ошибка #password-error: «Не менее 8 символов, буква и цифра».
- Без согласия показывайте #consent-error: «Нужно согласие».
- Ошибки — элементы с role=alert. Для первых трёх полей aria-describedby ссылается на соответствующую ошибку; aria-invalid отражает результат последней отправки. До первой отправки сообщений об ошибке нет (можно оставить пустые контейнеры).
- Корректная отправка очищает ошибки и показывает output#success «Имя: e-mail», обрезав пробелы в имени и приведя trimmed e-mail к нижнему регистру. Любое последующее изменение поля скрывает старое подтверждение.
- «Очистить» возвращает пустые поля, снятое согласие, отсутствие подтверждения и сообщений об ошибках.

Это авторская задача по типу Signup Form. Пароль и введённые данные никуда не отправляются.`,
      starter: starter('Заявка на участие', '<form noValidate><label htmlFor="name">Имя</label><input id="name" /><label htmlFor="email">E-mail</label><input id="email" type="email" /><label htmlFor="password">Пароль</label><input id="password" type="password" /><label><input id="consent" type="checkbox" /> Согласен с условиями</label><button id="submit" type="button">Отправить</button><button id="reset" type="button">Очистить</button></form>'),
      solution: formSolution,
      incorrect: formSolution.replace('if (!emailValid(email.trim()))', "if (!email.trim().includes('@'))"),
      solutionNotes: 'Поля хранят исходный ввод, а нормализация выполняется при отправке. Проверки собирают ошибки в один объект; отсутствие ошибок определяет успех. Подтверждение скрывается при изменении формы, чтобы старый успех не описывал новые данные.',
      hints: ['В onSubmit предотвратите стандартную навигацию и соберите все ошибки сразу.', 'Держите объект errors отдельно от значений полей.', 'Не ограничивайтесь проверкой наличия @: проверьте домен и пробелы.'],
      runtimeCases: [
        scenario('Пустая форма показывает все ошибки', false, [click('#submit'), text('#name-error', 'Введите имя от 2 символов'), text('#email-error', 'Введите корректный e-mail'), text('#password-error', 'Не менее 8 символов, буква и цифра'), text('#consent-error', 'Нужно согласие'), attr('#email', 'aria-invalid', 'true'), attr('#email', 'aria-describedby', 'email-error'), count('#success', 0)]),
        scenario('Корректная отправка нормализует данные', false, [fill('#name', '  Иван  '), fill('#email', 'IVAN@Example.test'), fill('#password', 'Secure123'), click('#consent'), click('#submit'), text('#success', 'Иван: ivan@example.test'), text('#name-error', ''), text('#email-error', ''), attr('#email', 'aria-invalid', 'false')]),
        scenario('Наличие @ ещё не делает адрес корректным', true, [fill('#name', 'Иван'), fill('#email', 'wrong@'), fill('#password', 'Secure123'), click('#consent'), click('#submit'), text('#email-error', 'Введите корректный e-mail'), count('#success', 0), fill('#email', 'first last@example.test'), click('#submit'), text('#email-error', 'Введите корректный e-mail'), fill('#email', 'ivan@example.test'), fill('#password', 'ABCDEFGH'), click('#submit'), text('#password-error', 'Не менее 8 символов, буква и цифра'), fill('#password', '12345678'), click('#submit'), text('#password-error', 'Не менее 8 символов, буква и цифра'), fill('#password', 'a1bcdef'), click('#submit'), text('#password-error', 'Не менее 8 символов, буква и цифра'), fill('#password', 'a1bcdefg'), click('#submit'), text('#success', 'Иван: ivan@example.test')]),
        scenario('Исправление и новое редактирование', true, [click('#submit'), fill('#name', 'Анна'), fill('#email', 'anna@example.test'), fill('#password', 'Secure123'), click('#consent'), click('#submit'), text('#success', 'Анна: anna@example.test'), text('#consent-error', ''), fill('#name', 'Мария'), count('#success', 0), click('#submit'), text('#success', 'Мария: anna@example.test')]),
        scenario('Сброс очищает данные и согласие', true, [fill('#name', 'Иван'), fill('#email', 'ivan@example.test'), fill('#password', 'Secure123'), click('#consent'), click('#submit'), visible('#success'), click('#reset'), count('#success', 0), count('#consent:checked', 0), text('#name-error', ''), click('#submit'), text('#name-error', 'Введите имя от 2 символов'), text('#email-error', 'Введите корректный e-mail'), text('#password-error', 'Не менее 8 символов, буква и цифра'), text('#consent-error', 'Нужно согласие')]),
      ],
    }),
    task({
      slug: 'react-interview-modal-draft',
      title: 'React: модальная заметка с отменой и Escape',
      difficulty: 'medium',
      recommendedMinutes: 30,
      tags: ['react', 'hooks', 'state', 'accessibility', 'forms'],
      sourceUrl: 'https://www.greatfrontend.com/questions/user-interface/modal-dialog',
      descriptionMd: `Создайте редактор заметки в нативном dialog. Изначально p#saved-note содержит «Первая заметка», диалог закрыт.

Требования:
- button#open-modal «Редактировать заметку» открывает dialog#note-dialog через showModal. Диалог имеет aria-labelledby="dialog-title" и h2#dialog-title «Редактирование заметки».
- При каждом открытии черновик снова берётся из последней сохранённой заметки. input#note имеет label «Заметка»; после открытия поле получает фокус. output#draft-preview отражает его текущий текст.
- #save-note сохраняет trimmed-непустой текст в #saved-note и закрывает диалог. Для черновика из одних пробелов эта кнопка disabled.
- #cancel-note и Escape закрывают диалог без изменения сохранённой заметки. Черновик отменённого редактирования не появляется при новом открытии.
- После любого закрытия фокус возвращается к #open-modal. Нативный dialog обеспечивает модальность; не заменяйте его обычным div.

Данные существуют только в памяти React. Учебный тип задания подтверждён источником Modal Dialog; конкретная авторская версия и её частота у работодателей не утверждаются.`,
      starter: starter('Заметка к интервью', '<p id="saved-note">Первая заметка</p><button id="open-modal" type="button">Редактировать заметку</button><dialog id="note-dialog" aria-labelledby="dialog-title"><h2 id="dialog-title">Редактирование заметки</h2><label htmlFor="note">Заметка</label><input id="note" defaultValue="Первая заметка" /><output id="draft-preview">Первая заметка</output><button id="save-note" type="button">Сохранить</button><button id="cancel-note" type="button">Отмена</button></dialog>'),
      solution: modalSolution,
      incorrect: modalSolution.replace('setDraft(saved); setOpen(true)', 'setOpen(true)'),
      solutionNotes: 'Сохранённый текст и черновик — разные состояния. При открытии черновик инициализируется заново; отмена не записывает его. showModal/close синхронизируются с React-состоянием через effect, событие cancel от Escape обрабатывается явно.',
      hints: ['Разделите saved, draft и open; храните ссылку на dialog через useRef.', 'В onCancel предотвратите стандартное закрытие и обновите open, чтобы состояние не расходилось с DOM.', 'При открытии копируйте saved в draft, а после закрытия возвращайте фокус кнопке.'],
      runtimeCases: [
        scenario('Открытие и сохранение', false, [visible('#note-dialog', false), click('#open-modal'), visible('#note-dialog'), count('#note-dialog:modal', 1), count('#note:focus', 1), attr('#note-dialog', 'aria-labelledby', 'dialog-title'), fill('#note', '  Повторить useEffect  '), text('#draft-preview', '  Повторить useEffect  '), click('#save-note'), visible('#note-dialog', false), text('#saved-note', 'Повторить useEffect'), count('#open-modal:focus', 1)]),
        scenario('Отмена отбрасывает черновик', false, [click('#open-modal'), fill('#note', 'Не сохранять'), click('#cancel-note'), text('#saved-note', 'Первая заметка'), click('#open-modal'), text('#draft-preview', 'Первая заметка')]),
        scenario('Escape закрывает и возвращает фокус', true, [click('#open-modal'), fill('#note', 'Не сохранять через Escape'), press('#note', 'Escape'), visible('#note-dialog', false), text('#saved-note', 'Первая заметка'), count('#open-modal:focus', 1), click('#open-modal'), text('#draft-preview', 'Первая заметка')]),
        scenario('После сохранения новый черновик берётся из saved', true, [click('#open-modal'), fill('#note', 'Новый текст'), click('#save-note'), click('#open-modal'), text('#draft-preview', 'Новый текст'), fill('#note', 'Другой черновик'), click('#cancel-note'), click('#open-modal'), text('#draft-preview', 'Новый текст')]),
        scenario('Пробелы не сохраняются', true, [click('#open-modal'), fill('#note', '   '), attr('#save-note', 'disabled', ''), click('#cancel-note'), text('#saved-note', 'Первая заметка'), visible('#note-dialog', false)]),
      ],
    }),
    task({
      slug: 'react-interview-accordion',
      title: 'React: независимые секции аккордеона',
      difficulty: 'easy',
      recommendedMinutes: 20,
      tags: ['react', 'state', 'accessibility'],
      sourceUrl: 'https://www.greatfrontend.com/questions/user-interface/accordion',
      descriptionMd: `Реализуйте памятку React из трёх независимо раскрывающихся секций. Изначально все закрыты.

Данные:
- state — «Состояние»: «Храните изменяющиеся данные в состоянии.»
- props — «Пропсы»: «Передавайте данные от родителя к ребёнку.»
- effects — «Эффекты»: «Синхронизируйте компонент с внешней системой.»

Требования:
- Заголовок секции — h2 с нативным button#trigger-state и аналогичными кнопками для props/effects.
- Кнопка имеет aria-expanded, соответствующий видимости, и aria-controls="panel-state" (аналогично для других секций).
- Панель div#panel-state имеет role="region", aria-labelledby="trigger-state". Закрытые панели остаются в DOM с hidden.
- Клик, Enter или пробел переключает только указанную секцию. Можно одновременно открыть несколько секций.
- button#close-all «Закрыть всё» закрывает все панели, обновляя aria-expanded; после этого любую секцию можно снова раскрыть.

Внешние библиотеки не нужны. Подумайте, почему один openedId не подходит для независимых секций.`,
      starter: starter('Памятка React', '{[{ id: "state", title: "Состояние", content: "Храните изменяющиеся данные в состоянии." }, { id: "props", title: "Пропсы", content: "Передавайте данные от родителя к ребёнку." }, { id: "effects", title: "Эффекты", content: "Синхронизируйте компонент с внешней системой." }].map(section => <section key={section.id}><h2><button id={"trigger-" + section.id} type="button" aria-expanded="false" aria-controls={"panel-" + section.id}>{section.title}</button></h2><div id={"panel-" + section.id} role="region" aria-labelledby={"trigger-" + section.id} hidden>{section.content}</div></section>)}<button id="close-all" type="button">Закрыть всё</button>'),
      solution: accordionSolution,
      incorrect: accordionSolution.replace('[...previous, section.id]', '[section.id]'),
      solutionNotes: 'Набор открытых id представляет независимые состояния секций. Один выбранный id незаметно превращает условие в аккордеон с единственной открытой секцией. Нативные кнопки уже обрабатывают Enter и пробел через click, дополнительные keydown-обработчики здесь могут переключить состояние дважды.',
      hints: ['Используйте массив или Set открытых id.', 'Панель можно скрывать через hidden, сохраняя DOM и ARIA-связь.', 'Не дублируйте обработку Enter/пробела, если переключение уже привязано к click нативной кнопки.'],
      runtimeCases: [
        scenario('Переключение одной секции', false, [visible('#panel-state', false), click('#trigger-state'), visible('#panel-state'), text('#panel-state', 'Храните изменяющиеся данные в состоянии.'), attr('#trigger-state', 'aria-expanded', 'true'), click('#trigger-state'), visible('#panel-state', false), attr('#trigger-state', 'aria-expanded', 'false')]),
        scenario('Несколько секций открыты независимо', true, [click('#trigger-state'), click('#trigger-props'), visible('#panel-state'), visible('#panel-props'), visible('#panel-effects', false), click('#trigger-state'), visible('#panel-state', false), visible('#panel-props'), attr('#panel-props', 'aria-labelledby', 'trigger-props'), attr('#trigger-props', 'aria-controls', 'panel-props')]),
        scenario('Enter и пробел работают как клик', true, [press('#trigger-effects', 'Enter'), visible('#panel-effects'), press('#trigger-effects', 'Space'), visible('#panel-effects', false), press('#trigger-props', 'Space'), visible('#panel-props'), visible('#panel-effects', false)]),
        scenario('Закрытие всех секций и повторное раскрытие', false, [click('#trigger-state'), click('#trigger-props'), click('#trigger-effects'), click('#close-all'), count('[role="region"][hidden]', 3), attr('#trigger-state', 'aria-expanded', 'false'), attr('#trigger-props', 'aria-expanded', 'false'), attr('#trigger-effects', 'aria-expanded', 'false'), click('#trigger-effects'), visible('#panel-effects'), visible('#panel-state', false)]),
      ],
    }),
    task({
      slug: 'react-interview-cart-derived-totals',
      title: 'React: корзина с вычисляемой скидкой и остатками',
      difficulty: 'medium',
      recommendedMinutes: 30,
      tags: ['react', 'hooks', 'state', 'arrays'],
      sourceUrl: 'https://react.dev/learn/choosing-the-state-structure',
      descriptionMd: `Сделайте корзину с двумя товарами: book — «Книга», цена 400 ₽, остаток 3; pen — «Ручка», цена 100 ₽, остаток 5. Начальные количества равны нулю.

Требования:
- ul#products содержит li[data-id="book"] и li[data-id="pen"]. Текущее количество выводится в output.quantity.
- Кнопки .plus/.minus увеличивают/уменьшают количество на 1, не выходя за диапазон 0..остаток. На нижней границе .minus disabled, на верхней — .plus disabled. После изменения границы доступность восстанавливается.
- .remove обнуляет только количество своего товара.
- #units — сумма количеств; #subtotal — сумма цена × количество. #discount равен 10% от subtotal, если subtotal >= 1000, иначе 0. #total = subtotal - discount.
- Все четыре итога содержат только число без знака валюты. Цены подобраны так, что результаты целые. Скидка исчезает, как только сумма снова становится меньше 1000.

Храните количества как состояние, а итоги вычисляйте при рендере. Не используйте API, хранение в localStorage или внешние пакеты. Это авторское упражнение на вычисляемое состояние; источник не утверждает использование такой корзины определённым работодателем.`,
      starter: starter('Корзина для подготовки', '<ul id="products">{[{ id: "book", title: "Книга", price: 400 }, { id: "pen", title: "Ручка", price: 100 }].map(product => <li key={product.id} data-id={product.id}><span>{product.title}: {product.price} ₽</span><output className="quantity">0</output><button className="minus" type="button" disabled>−</button><button className="plus" type="button">+</button><button className="remove" type="button">Убрать</button></li>)}</ul><dl><dt>Товаров</dt><dd id="units">0</dd><dt>Сумма до скидки</dt><dd id="subtotal">0</dd><dt>Скидка</dt><dd id="discount">0</dd><dt>К оплате</dt><dd id="total">0</dd></dl>'),
      solution: cartSolution,
      incorrect: cartSolution.replace('subtotal >= 1000', 'subtotal > 1000'),
      solutionNotes: 'Цена и остаток — фиксированные данные, количества — состояние, subtotal/discount/total/units — производные значения. Пересчёт при каждом рендере предотвращает устаревшую скидку после уменьшения количества или удаления товара.',
      hints: ['Сложите price * quantity через reduce; отдельное состояние total не требуется.', 'Порог скидки включительный: ровно 1000 тоже даёт скидку.', 'Меняйте только один id функциональным обновлением объекта количеств.'],
      runtimeCases: [
        scenario('Добавление разных товаров и итоги', false, [text('#total', '0'), attr('#products > li[data-id="book"] .minus', 'disabled', ''), click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="pen"] .plus'), text('#units', '2'), text('#subtotal', '500'), text('#discount', '0'), text('#total', '500'), count('#products > li[data-id="book"] .minus:not([disabled])', 1)]),
        scenario('Скидка включается ровно на пороге и снимается ниже', true, [click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="pen"] .plus'), click('#products > li[data-id="pen"] .plus'), text('#subtotal', '1000'), text('#discount', '100'), text('#total', '900'), click('#products > li[data-id="pen"] .minus'), text('#subtotal', '900'), text('#discount', '0'), text('#total', '900')]),
        scenario('Остатки ограничивают количества', true, [click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="book"] .plus'), text('#products > li[data-id="book"] .quantity', '3'), attr('#products > li[data-id="book"] .plus', 'disabled', ''), text('#discount', '120'), text('#total', '1080'), click('#products > li[data-id="book"] .minus'), count('#products > li[data-id="book"] .plus:not([disabled])', 1), text('#total', '800'), click('#products > li[data-id="pen"] .plus'), click('#products > li[data-id="pen"] .plus'), click('#products > li[data-id="pen"] .plus'), click('#products > li[data-id="pen"] .plus'), click('#products > li[data-id="pen"] .plus'), text('#products > li[data-id="pen"] .quantity', '5'), attr('#products > li[data-id="pen"] .plus', 'disabled', ''), text('#units', '7'), text('#discount', '130'), text('#total', '1170')]),
        scenario('Удаление обнуляет только свой товар', false, [click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="pen"] .plus'), click('#products > li[data-id="pen"] .plus'), click('#products > li[data-id="book"] .remove'), text('#products > li[data-id="book"] .quantity', '0'), text('#products > li[data-id="pen"] .quantity', '2'), text('#units', '2'), text('#total', '200'), attr('#products > li[data-id="book"] .minus', 'disabled', '')]),
        scenario('Удаление возвращает пустую корзину без скидки', true, [click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="book"] .plus'), click('#products > li[data-id="book"] .remove'), text('#units', '0'), text('#subtotal', '0'), text('#discount', '0'), text('#total', '0'), count('#products > li[data-id="book"] .plus:not([disabled])', 1)]),
      ],
    }),
  ],
}
