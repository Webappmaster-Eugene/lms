import type { TrainerTaskSeed, TrainerTopicSeed } from './types'
import type { FrontendLanguage } from '@/lib/trainer/runtime-spec'

function projectTask(task: Omit<TrainerTaskSeed, 'languages' | 'checkMode' | 'starterCode' | 'solutionCode'> & {
  languages: FrontendLanguage[]
  starterFiles: Record<string, string>
  solutionFiles: Record<string, string>
}): TrainerTaskSeed {
  return {
    ...task,
    checkMode: 'dom',
    starterCode: JSON.stringify(task.starterFiles),
    solutionCode: JSON.stringify(task.solutionFiles),
  }
}

const counterStarter = {
  'App.jsx': `import './styles.css'

export default function App() {
  return (
    <main>
      <h1>Счётчик попыток</h1>
      <output id="count" aria-live="polite">0</output>
      <div className="controls">
        <button id="decrement" type="button">Уменьшить</button>
        <button id="increment" type="button">Увеличить</button>
        <button id="reset" type="button">Сбросить</button>
      </div>
    </main>
  )
}`,
  'styles.css': `body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
.controls { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
button { font: inherit; padding: 8px 16px; }
output { font-size: 32px; }`,
}

const nextProjectBase = {
  'app/layout.jsx': `import './globals.css'

export default function RootLayout({ children }) {
  return <html lang="ru"><body>{children}</body></html>
}`,
  'app/globals.css': `body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; }
main { max-width: 720px; margin: 0 auto; }
li { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 0; }
button { font: inherit; padding: 8px 12px; }`,
  'lib/courses.json': JSON.stringify([
    { id: 'react', title: 'React' },
    { id: 'go', title: 'Go' },
    { id: 'css', title: 'CSS' },
  ]),
}

export const frontendTopic: TrainerTopicSeed = {
  slug: 'frontend-development',
  title: 'Frontend: интерфейсы в браузере',
  description: 'HTML, адаптивный CSS, React и Next.js: предпросмотр и проверки в браузере',
  category: 'frontend',
  icon: '🖼️',
  order: 20,
  tasks: [
    projectTask({
      slug: 'html-responsive-profile',
      title: 'Доступная адаптивная карточка',
      difficulty: 'easy',
      languages: ['html'],
      descriptionMd: `Сверстайте карточку разработчика в index.html и style.css. Файлы уже открыты в редакторе: выберите нужную вкладку и измените код. Стили подключаются обычным <link rel="stylesheet" href="style.css">.

Требования:
- На странице один main с заголовком h1 «Команда». Карточка — article с классом profile и aria-labelledby="profile-name".
- Сохраните lang="ru" у html и метатег viewport из шаблона.
- В карточке h2#profile-name с текстом «Анна Смирнова» и абзац «Frontend-разработчик».
- Список ul.skills содержит три li: HTML, CSS и React в этом порядке.
- Ссылка #contact с текстом «Написать Анне» ведёт на mailto:anna@example.com. Ссылка остаётся обычной ссылкой, доступной с клавиатуры.
- .profile использует display: flex и gap: 16px. При ширине окна больше 640px направление row, а при ширине 640px и меньше — column. Карточка не должна создавать горизонтальную прокрутку на телефоне.

«Запустить» показывает предпросмотр и проверяет элементы и вычисленные стили в настоящем браузере. Для собственной проверки задайте CSS-селектор, например #contact, и ожидаемый текст «Написать Анне». «Отправить» проверяет решение на сервере. Внешние изображения, шрифты и библиотеки не нужны.`,
      starterFiles: {
        'index.html': `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Команда</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h1>Команда</h1>
    <!-- Добавьте семантическую карточку разработчика. -->
  </main>
</body>
</html>`,
        'style.css': `body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; }
/* Настройте карточку и мобильную раскладку. */`,
      },
      solutionFiles: {
        'index.html': `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Команда</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h1>Команда</h1>
    <article class="profile" aria-labelledby="profile-name">
      <div>
        <h2 id="profile-name">Анна Смирнова</h2>
        <p>Frontend-разработчик</p>
        <a id="contact" href="mailto:anna@example.com">Написать Анне</a>
      </div>
      <ul class="skills">
        <li>HTML</li>
        <li>CSS</li>
        <li>React</li>
      </ul>
    </article>
  </main>
</body>
</html>`,
        'style.css': `* { box-sizing: border-box; }
body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; color: #172554; background: #eff6ff; }
main { max-width: 720px; margin: 0 auto; }
.profile { display: flex; flex-direction: row; gap: 16px; padding: 24px; border: 1px solid #93c5fd; border-radius: 12px; background: white; }
.profile > div { min-width: 0; }
h2 { margin-top: 0; }
.skills { padding-left: 24px; }
a { color: #1d4ed8; overflow-wrap: anywhere; }
a:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 4px; }
@media (max-width: 640px) {
  .profile { flex-direction: column; }
}`,
      },
      solutionNotes: 'Семантические элементы и aria-labelledby связывают карточку с её заголовком. Media query меняет направление flex без второй копии разметки.',
      hints: ['Используйте article, h2, ul и настоящую ссылку a.', 'Начните с flex-direction: row; в @media (max-width: 640px) задайте column.'],
      runtimeCases: [
        {
          name: 'Структура карточки', hidden: false,
          checks: [
            { selector: 'main', count: 1 },
            { selector: 'main > h1', text: 'Команда', count: 1 },
            { selector: 'article.profile', count: 1, attribute: { name: 'aria-labelledby', value: 'profile-name' } },
            { selector: 'article.profile h2#profile-name', text: 'Анна Смирнова' },
            { selector: 'article.profile p', text: 'Frontend-разработчик' },
          ],
        },
        {
          name: 'Контакт и навыки', hidden: false,
          checks: [
            { selector: 'a#contact', text: 'Написать Анне', attribute: { name: 'href', value: 'mailto:anna@example.com' } },
            { selector: 'ul.skills > li', count: 3 },
            { selector: 'ul.skills > li:nth-child(1)', text: 'HTML' },
            { selector: 'ul.skills > li:nth-child(2)', text: 'CSS' },
            { selector: 'ul.skills > li:nth-child(3)', text: 'React' },
          ],
        },
        {
          name: 'Flex-раскладка на широком экране', hidden: true,
          viewport: { width: 1280, height: 720 },
          checks: [{ selector: '.profile', css: { display: 'flex', gap: '16px', 'flex-direction': 'row' } }],
        },
        {
          name: 'Мобильная раскладка', hidden: true,
          viewport: { width: 375, height: 812 },
          checks: [{ selector: '.profile', css: { display: 'flex', gap: '16px', 'flex-direction': 'column' } }],
        },
        {
          name: 'Граница мобильной раскладки', hidden: true,
          viewport: { width: 640, height: 720 },
          checks: [{ selector: '.profile', css: { 'flex-direction': 'column' } }],
        },
        {
          name: 'После мобильной границы', hidden: true,
          viewport: { width: 641, height: 720 },
          checks: [{ selector: '.profile', css: { 'flex-direction': 'row' } }],
        },
        {
          name: 'Семантика страницы', hidden: true,
          checks: [
            { selector: 'html', attribute: { name: 'lang', value: 'ru' } },
            { selector: 'meta[name="viewport"]', attribute: { name: 'content', value: 'width=device-width, initial-scale=1' } },
            { selector: 'a#contact', visible: true },
          ],
        },
      ],
    }),
    projectTask({
      slug: 'react-bounded-counter',
      title: 'React: счётчик с границами',
      difficulty: 'easy',
      languages: ['react'],
      descriptionMd: `Реализуйте React-компонент App в App.jsx. Он показывает число попыток и три кнопки. Стили находятся в styles.css и уже подключены. Компонент экспортируется по умолчанию.

Требования:
- output#count начинает с 0 и содержит только текущее число; сохраните aria-live="polite".
- button#increment увеличивает число на 1, button#decrement уменьшает на 1. Значение всегда остаётся в диапазоне от 0 до 5 включительно.
- На 0 кнопка уменьшения disabled, на 5 кнопка увеличения disabled. После изменения состояния кнопки снова доступны, если граница не достигнута.
- button#reset возвращает 0 и корректно обновляет доступность кнопок.
- Сохраните id, подписи и type="button" у кнопок: их используют проверки интерфейса.

«Запустить» собирает проект, показывает его в предпросмотре и нажимает кнопки в настоящем браузере. Каждый пример начинается с нового состояния. В собственной проверке можно сначала нажать #increment, а затем проверить текст #count: 1. «Отправить» запускает также скрытые последовательности действий на сервере. Используйте React и стандартные браузерные API; устанавливать пакеты не нужно.`,
      starterFiles: counterStarter,
      solutionFiles: {
        ...counterStarter,
        'App.jsx': `import { useState } from 'react'
import './styles.css'

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <main>
      <h1>Счётчик попыток</h1>
      <output id="count" aria-live="polite">{count}</output>
      <div className="controls">
        <button id="decrement" type="button" disabled={count === 0} onClick={() => setCount(value => Math.max(0, value - 1))}>Уменьшить</button>
        <button id="increment" type="button" disabled={count === 5} onClick={() => setCount(value => Math.min(5, value + 1))}>Увеличить</button>
        <button id="reset" type="button" onClick={() => setCount(0)}>Сбросить</button>
      </div>
    </main>
  )
}`,
      },
      solutionNotes: 'Состояние хранится в useState. Функциональная форма setCount работает с последним значением; Math.min/Math.max сохраняют границы независимо от состояния кнопки.',
      hints: ['Добавьте useState(0) и выводите count внутри output.', 'disabled зависит от текущего состояния. Для сброса вызовите setCount(0).'],
      runtimeCases: [
        {
          name: 'Начальное состояние', hidden: false,
          checks: [
            { selector: '#count', text: '0' },
            { selector: '#decrement', attribute: { name: 'disabled', value: '' } },
            { selector: '#increment:not([disabled])', count: 1 },
          ],
        },
        {
          name: 'Увеличение и уменьшение', hidden: false,
          checks: [
            { selector: '#increment', action: 'click' },
            { selector: '#increment', action: 'click' },
            { selector: '#count', text: '2' },
            { selector: '#decrement', action: 'click' },
            { selector: '#count', text: '1' },
            { selector: '#decrement:not([disabled])', count: 1 },
          ],
        },
        {
          name: 'Верхняя граница и возвращение', hidden: true,
          checks: [
            ...Array.from({ length: 5 }, () => ({ selector: '#increment', action: 'click' as const })),
            { selector: '#count', text: '5' },
            { selector: '#increment', attribute: { name: 'disabled', value: '' } },
            { selector: '#decrement', action: 'click' },
            { selector: '#count', text: '4' },
            { selector: '#increment:not([disabled])', count: 1 },
          ],
        },
        {
          name: 'Сброс и нижняя граница', hidden: true,
          checks: [
            { selector: '#increment', action: 'click' },
            { selector: '#increment', action: 'click' },
            { selector: '#reset', action: 'click' },
            { selector: '#count', text: '0' },
            { selector: '#increment', action: 'click' },
            { selector: '#decrement', action: 'click' },
            { selector: '#count', text: '0' },
            { selector: '#decrement', attribute: { name: 'disabled', value: '' } },
            { selector: '#increment:not([disabled])', count: 1 },
            { selector: 'output#count', attribute: { name: 'aria-live', value: 'polite' } },
          ],
        },
      ],
    }),
    projectTask({
      slug: 'react-course-filter',
      title: 'React: фильтр списка курсов',
      difficulty: 'medium',
      languages: ['react'],
      descriptionMd: `Создайте поиск по курсам в React-компоненте App (App.jsx, default export). Данные уже есть в courses: JavaScript, TypeScript, React и Go. Сохраняйте исходный порядок.

Требования:
- label «Название курса» связан с input#search, поле управляется состоянием React.
- При вводе показывайте в ul#courses только курсы, название которых содержит запрос. Регистр не учитывается; пробелы по краям запроса игнорируются.
- Пустой запрос показывает все четыре курса. Каждый курс — отдельный li, содержащий его название.
- Если ничего не найдено, список остаётся пустым, а p#empty содержит «Курсы не найдены». При наличии результатов #empty отсутствует.
- Кнопка button#clear с подписью «Очистить» очищает поле и возвращает все курсы без перезагрузки страницы.

«Запустить» вводит запросы и проверяет DOM в настоящем браузере; каждый пример начинается с нового состояния. В собственной проверке введите React в #search и проверьте количество #courses > li: 1. «Отправить» запускает скрытые проверки на сервере. Внешние запросы и пакеты не нужны.`,
      starterFiles: {
        'App.jsx': `import './styles.css'

const courses = ['JavaScript', 'TypeScript', 'React', 'Go']

export default function App() {
  return (
    <main>
      <h1>Курсы</h1>
      <label htmlFor="search">Название курса</label>
      <input id="search" type="search" />
      <button id="clear" type="button">Очистить</button>
      <ul id="courses">{courses.map(course => <li key={course}>{course}</li>)}</ul>
    </main>
  )
}`,
        'styles.css': `body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; }
label { display: block; margin-bottom: 8px; }
input, button { font: inherit; padding: 8px; }
button { margin-left: 12px; }
li { margin-block: 12px; }`,
      },
      solutionFiles: {
        'App.jsx': `import { useState } from 'react'
import './styles.css'

const courses = ['JavaScript', 'TypeScript', 'React', 'Go']

export default function App() {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const filtered = courses.filter(course => course.toLowerCase().includes(query))
  return (
    <main>
      <h1>Курсы</h1>
      <label htmlFor="search">Название курса</label>
      <input id="search" type="search" value={search} onChange={event => setSearch(event.target.value)} />
      <button id="clear" type="button" onClick={() => setSearch('')}>Очистить</button>
      <ul id="courses">{filtered.map(course => <li key={course}>{course}</li>)}</ul>
      {filtered.length === 0 && <p id="empty">Курсы не найдены</p>}
    </main>
  )
}`,
        'styles.css': `body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; }
label { display: block; margin-bottom: 8px; }
input, button { font: inherit; padding: 8px; }
button { margin-left: 12px; }
li { margin-block: 12px; }`,
      },
      solutionNotes: 'Запрос хранится в состоянии, а список вычисляется при рендере. Нормализация относится к сравнению: исходный текст поля сохраняется до очистки.',
      hints: ['Нормализуйте обе строки через toLowerCase; для запроса дополнительно используйте trim.', 'Список можно получить через filter, а состояние очистить вызовом setSearch.'],
      runtimeCases: [
        {
          name: 'Исходный список и поиск', hidden: false,
          checks: [
            { selector: '#courses > li', count: 4 },
            { selector: '#search', action: 'fill', value: 'React' },
            { selector: '#courses > li', count: 1 },
            { selector: '#courses > li', text: 'React' },
            { selector: '#empty', count: 0 },
          ],
        },
        {
          name: 'Нет совпадений', hidden: false,
          checks: [
            { selector: '#search', action: 'fill', value: 'Python' },
            { selector: '#courses > li', count: 0 },
            { selector: '#empty', text: 'Курсы не найдены' },
          ],
        },
        {
          name: 'Регистр, пробелы и порядок', hidden: true,
          checks: [
            { selector: '#search', action: 'fill', value: '  SCRIPT  ' },
            { selector: '#courses > li', count: 2 },
            { selector: '#courses > li:nth-child(1)', text: 'JavaScript' },
            { selector: '#courses > li:nth-child(2)', text: 'TypeScript' },
            { selector: '#empty', count: 0 },
          ],
        },
        {
          name: 'Очистка после пустого результата', hidden: true,
          checks: [
            { selector: 'label[for="search"]', text: 'Название курса' },
            { selector: '#search', action: 'fill', value: 'нет такого курса' },
            { selector: '#clear', action: 'click' },
            { selector: '#search', attribute: { name: 'value', value: '' } },
            { selector: '#courses > li', count: 4 },
            { selector: '#empty', count: 0 },
            { selector: '#search', action: 'fill', value: ' ' },
            { selector: '#courses > li', count: 4 },
            { selector: '#search', action: 'fill', value: 'go' },
            { selector: '#courses > li', count: 1 },
            { selector: '#courses > li', text: 'Go' },
          ],
        },
      ],
    }),
    projectTask({
      slug: 'next-server-catalog',
      title: 'Next.js: серверный каталог и избранное',
      difficulty: 'medium',
      languages: ['next'],
      descriptionMd: `Завершите проект Next.js App Router. app/page.jsx — серверная страница, app/Favorite.jsx — маленький клиентский компонент для кнопки избранного. app/layout.jsx и данные lib/courses.json уже подготовлены.

Страница получает searchParams: в Next.js 15 это Promise, поэтому сначала выполните await searchParams. Параметр q фильтрует названия курсов по подстроке без учёта регистра и пробелов по краям. Если q отсутствует, пуст или не является строкой, покажите все курсы из JSON в исходном порядке.

Разметка: main, h1 «Каталог курсов», ul#courses. Для каждого курса создайте li[data-course="id"] с названием и компонентом Favorite. Если ничего не найдено, список пуст, а p#empty содержит «Курсы не найдены».

Favorite принимает courseId. Его button[type="button"] имеет data-course="id" и aria-pressed="false" вначале. Нажатие меняет подпись «В избранное» на «В избранном» и aria-pressed на true. Повторное нажатие возвращает исходное состояние. Состояние каждой кнопки независимо. Храните его в useState внутри файла с директивой 'use client'.

«Запустить» запускает настоящий Next.js, открывает страницу и проверяет серверный результат и клиентские действия. Проверки могут открывать разные адреса: /, /?q=react и /?q=нет. В предпросмотре доступны кнопки избранного. «Отправить» запускает также скрытые сценарии на сервере. Внешние API и дополнительные пакеты не нужны.`,
      starterFiles: {
        'app/page.jsx': `import courses from '../lib/courses.json'
import Favorite from './Favorite'

export default async function Page({ searchParams }) {
  // Прочитайте searchParams и отфильтруйте courses на сервере.
  return (
    <main>
      <h1>Каталог курсов</h1>
      <ul id="courses">{courses.map(course => (
        <li key={course.id} data-course={course.id}>
          <span>{course.title}</span>
          <Favorite courseId={course.id} />
        </li>
      ))}</ul>
    </main>
  )
}`,
        'app/Favorite.jsx': `'use client'

export default function Favorite({ courseId }) {
  return <button type="button" data-course={courseId} aria-pressed="false">В избранное</button>
}`,
        ...nextProjectBase,
      },
      solutionFiles: {
        'app/page.jsx': `import courses from '../lib/courses.json'
import Favorite from './Favorite'

export default async function Page({ searchParams }) {
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q.trim().toLowerCase() : ''
  const filtered = courses.filter(course => course.title.toLowerCase().includes(query))
  return (
    <main>
      <h1>Каталог курсов</h1>
      <ul id="courses">{filtered.map(course => (
        <li key={course.id} data-course={course.id}>
          <span>{course.title}</span>
          <Favorite courseId={course.id} />
        </li>
      ))}</ul>
      {filtered.length === 0 && <p id="empty">Курсы не найдены</p>}
    </main>
  )
}`,
        'app/Favorite.jsx': `'use client'

import { useState } from 'react'

export default function Favorite({ courseId }) {
  const [selected, setSelected] = useState(false)
  return (
    <button type="button" data-course={courseId} aria-pressed={selected} onClick={() => setSelected(value => !value)}>
      {selected ? 'В избранном' : 'В избранное'}
    </button>
  )
}`,
        ...nextProjectBase,
      },
      solutionNotes: 'Страница читает query и фильтрует JSON на сервере. Только Favorite требует клиентского состояния: каждое его вхождение получает собственный useState.',
      hints: ['Используйте const params = await searchParams и проверку typeof params.q.', 'Директива use client нужна компоненту с useState; серверная страница может импортировать его.'],
      timeLimitMs: 5000,
      runtimeCases: [
        {
          name: 'Каталог и избранное', hidden: false, path: '/',
          checks: [
            { selector: 'main > h1', text: 'Каталог курсов' },
            { selector: '#courses > li', count: 3 },
            { selector: 'button[data-course="react"]', text: 'В избранное', attribute: { name: 'aria-pressed', value: 'false' } },
            { selector: 'button[data-course="react"]', action: 'click' },
            { selector: 'button[data-course="react"]', text: 'В избранном', attribute: { name: 'aria-pressed', value: 'true' } },
          ],
        },
        {
          name: 'Фильтрация на серверной странице', hidden: false, path: '/?q=react',
          checks: [
            { selector: '#courses > li', count: 1 },
            { selector: 'li[data-course="react"] > span', text: 'React' },
            { selector: '#empty', count: 0 },
          ],
        },
        {
          name: 'Нормализация запроса', hidden: true, path: '/?q=%20GO%20',
          checks: [
            { selector: '#courses > li', count: 1 },
            { selector: 'li[data-course="go"] > span', text: 'Go' },
          ],
        },
        {
          name: 'Нет результатов', hidden: true, path: '/?q=Python',
          checks: [
            { selector: '#courses > li', count: 0 },
            { selector: '#empty', text: 'Курсы не найдены' },
          ],
        },
        {
          name: 'Независимое состояние кнопок', hidden: true, path: '/',
          checks: [
            { selector: 'button[data-course="react"]', action: 'click' },
            { selector: 'button[data-course="go"]', text: 'В избранное', attribute: { name: 'aria-pressed', value: 'false' } },
            { selector: 'button[data-course="react"]', action: 'click' },
            { selector: 'button[data-course="react"]', text: 'В избранное', attribute: { name: 'aria-pressed', value: 'false' } },
            { selector: 'button[data-course="go"]', action: 'click' },
            { selector: 'button[data-course="go"]', text: 'В избранном', attribute: { name: 'aria-pressed', value: 'true' } },
          ],
        },
        {
          name: 'Повторяющийся параметр', hidden: true, path: '/?q=React&q=Go',
          checks: [{ selector: '#courses > li', count: 3 }],
        },
        {
          name: 'Пустой параметр', hidden: true, path: '/?q=%20%20',
          checks: [{ selector: '#courses > li', count: 3 }],
        },
      ],
    }),
  ],
}
