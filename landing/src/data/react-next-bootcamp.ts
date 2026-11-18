import program from './react-next-program.json'
import { CONSENT_VERSION } from './bootcamp'
import type { BootcampNavigation } from './bootcamp-navigation'

// Публичная часть bootcamp/frontend/content/program.json. Эталон и ответы сюда не попадают.
export const PROGRAM_KEY = program.key
export const COURSE_NAME = `Буткемп ${program.title}`
export const BOOTCAMP_PATH = program.landingPath
export const PROGRAM_PATH = `${BOOTCAMP_PATH}program/`
export const FORMAT_PATH = `${BOOTCAMP_PATH}format/`
export const PAYMENT_PATH = `${BOOTCAMP_PATH}payment/`
export const OFFER_PATH = `${BOOTCAMP_PATH}offer/`
export const QUALITY_PATH = `${BOOTCAMP_PATH}quality/`
export const SAMPLE_PATH = `${BOOTCAMP_PATH}sample/`
export const PRIVACY_PATH = '/privacy/'
export const CONSENT_PATH = '/consent/'
export const OFFER_VERSION = '2026-11-18'
export const OFFER_DATE = '18 ноября 2026 года'
export const PAGE_UPDATED = { iso: OFFER_VERSION, text: OFFER_DATE }
const priceRubles = program.priceKopecks / 100
export const PRICE = { value: priceRubles, text: `${priceRubles.toLocaleString('ru-RU').replaceAll('\u00a0', ' ')} ₽` }
export const GROUP_LIMIT = program.groupLimit
export const WEEKS = program.weeks.length - 1
export const WEEKLY_HOURS = '15-20'
export const REVIEW_DAYS = 5
export const PROGRAM_WEEKS = program.weeks
export const NAVIGATION: BootcampNavigation = {
  title: 'Буткемп React + Next.js', path: BOOTCAMP_PATH,
  programPath: PROGRAM_PATH, formatPath: FORMAT_PATH,
  paymentPath: PAYMENT_PATH, offerPath: OFFER_PATH, qualityPath: QUALITY_PATH,
  updated: PAGE_UPDATED,
}
export { CONSENT_VERSION }

export const SUMMARY = `Буткемп React + Next.js от MentorCareer - ${WEEKS} учебных недель и неделя подготовки для тех, кто знает JavaScript и основы вёрстки. Вы создаёте два интерфейса одного сервиса проката: рабочий кабинет на React и витрину с кабинетом клиента на Next.js. Оба работают с настоящим backend Node.js-буткемпа. Каждую неделю вы сдаёте работу через merge request, получаете ревью наставника и исправляете замечания. Группа до ${GROUP_LIMIT} человек, нагрузка ${WEEKLY_HOURS} часов в неделю, стоимость ${PRICE.text} за весь поток. Дата старта пока не объявлена.`

export const FACTS = [
  { term: 'Длительность', value: `${WEEKS} учебных недель и неделя подготовки` },
  { term: 'Нагрузка', value: `${WEEKLY_HOURS} часов в неделю` },
  { term: 'Занятия', value: 'две групповые встречи в неделю: 2 часа и 1,5 часа' },
  { term: 'Группа', value: `до ${GROUP_LIMIT} человек, личное ревью каждой работы` },
  { term: 'Ревью', value: `ответ на каждую сдачу в течение ${REVIEW_DAYS} дней` },
  { term: 'Стоимость', value: `${PRICE.text} за весь поток` },
]

export const RHYTHM = [
  { when: 'Первая встреча, 2 часа', what: 'Задача недели, необходимые механизмы, разбор примера и вопросы.' },
  { when: 'Вторая встреча, 1,5 часа', what: 'Практика, диагностика ошибок и обсуждение решений. Взаимное ревью и парные упражнения.' },
  { when: 'Самостоятельная работа', what: 'Методичка, реализация задачи в своём репозитории, тесты и описание merge request.' },
  { when: `В течение ${REVIEW_DAYS} дней после сдачи`, what: 'Личное ревью наставника. Вы дорабатываете решение, повторяете проверки и объясняете изменения.' },
]

export const FAQ = [
  { question: 'Можно прийти без React?', answer: 'Да. Нужны уверенный JavaScript, основы HTML и CSS, async/await и базовая работа с Git. Подготовительное задание поможет обнаружить пробелы. React изучаем с начала, TypeScript вводим постепенно.' },
  { question: 'Нужно ли сначала пройти Node.js-буткемп?', answer: 'Нет. Для frontend-программы предоставляется готовый учебный backend. Если вы проходите и Node.js, сможете подключить собственный backend с совместимым API и собрать один полный проект. Доступ к материалам другого буткемпа отдельно не выдаётся.' },
  { question: 'Зачем два интерфейса?', answer: 'На React вы пишете рабочее приложение сотрудников: каталог, брони, выдачу и возврат. На Next.js - публичную витрину и кабинет клиента. У них разные задачи, но общие товары, пользователи и брони в одном Node.js backend.' },
  { question: 'Будет ли настоящий API?', answer: 'Да. Бронирование, оплата, права и хранение данных выполняются в Node.js backend сервиса проката. Моки помогают в отдельных упражнениях и тестах, а итоговый проект проверяется на настоящем API. Учебные платежи проходят через симулятор, без реальных списаний.' },
  { question: 'Когда старт и в какие дни встречи?', answer: 'Дата старта пока не объявлена. Даты подготовки, расписание двух встреч в неделю и сроки потока сообщим до оплаты. На этой странице нет оплаты.' },
  { question: 'Можно пользоваться ИИ?', answer: 'Да. В merge request вы указываете, где помогал ИИ и как проверили результат. На ревью и защите нужно объяснить код и изменить решение самостоятельно. Отдельные упражнения посвящены проверке ошибочных предложений ИИ.' },
  { question: 'Проект командный или личный?', answer: 'У каждого свой проект и история работ. При этом вы упражняетесь во взаимном ревью, парной диагностике и обсуждении архитектуры. Отсутствие напарника не мешает сдать собственную работу.' },
  { question: 'Что входит в стоимость?', answer: 'Две встречи в неделю и их записи, методички, задания, автоматические проверки, личное ревью, учебный backend, итоговая защита, техническое собеседование и паспорт проверенных навыков. Отдельное карьерное сопровождение обсуждается отдельно.' },
  { question: 'Что получится после обучения?', answer: 'Два работающих frontend-приложения, подключённых к одному backend, история merge request и ревью, тесты и паспорт показанных на защите навыков. Грейд и трудоустройство не гарантируются.' },
  { question: 'Можно вернуть деньги?', answer: 'Да. Можно отказаться до начала или во время обучения. Возвращается стоимость ещё не начавшихся учебных недель за вычетом только подтверждённых расходов, если они были. Порядок и сроки описаны в договоре-оферте.' },
]
