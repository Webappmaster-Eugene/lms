import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { createAdmin, createStudent, getTestPayload, login, rest, uid } from '../helpers/payload'

/**
 * Источники урока скрыты от ученика при чтении, но фильтр и сортировка работают
 * по сохранённым значениям: по ответу «нашлось / не нашлось» ссылку можно подобрать
 * посимвольно. Поэтому запросы по содержимому урока ученику закрыты.
 */

const KEY = `https://disk.yandex.com/d/${uid('key')}`
let payload: Payload
let adminToken: string
let studentToken: string
let lessonId: number

const count = (response: { json: Record<string, unknown> }) => response.json.totalDocs
const query = (params: Record<string, string>) => `?${new URLSearchParams(params)}`

beforeAll(async () => {
  payload = await getTestPayload()
  adminToken = await login(payload, await createAdmin(payload))
  studentToken = await login(payload, await createStudent(payload))
  const create = async (collection: string, body: Record<string, unknown>) => {
    const response = await rest('POST', `/${collection}`, { token: adminToken, body })
    expect(response.status, collection).toBe(201)
    return (response.json.doc as { id: number }).id
  }
  const roadmap = await create('roadmaps', { title: `Карта ${uid('q')}`, isPublished: true })
  const course = await create('courses', { title: `Курс ${uid('q')}`, roadmap, isPublished: true })
  lessonId = await create('lessons', {
    title: `Урок ${uid('q')}`, course, isPublished: true,
    content: [
      { blockType: 'video', title: 'Запись', videoUrl: `${KEY}/lesson.mp4`, displayMode: 'embed' },
      { blockType: 'slides', title: 'Гайд', folderUrl: `${KEY}/guide`, items: [{ url: `${KEY}/guide/1.png` }] },
    ],
  })
  const note = await rest('POST', '/notes', { token: studentToken, body: { lesson: lessonId, content: 'Заметка ученика' } })
  expect(note.status).toBe(201)
})

describe('запросы по содержимому урока', () => {
  it('ученик читает урок и ищет по названию как раньше', async () => {
    const byId = await rest('GET', `/lessons${query({ 'where[id][equals]': String(lessonId), depth: '0' })}`, { token: studentToken })
    expect(byId.status).toBe(200)
    expect(count(byId)).toBe(1)
    expect(JSON.stringify(byId.json)).not.toContain('disk.yandex')
    const byTitle = await rest('GET', `/lessons${query({ 'where[and][0][id][equals]': String(lessonId), 'where[and][1][title][contains]': 'Урок', sort: '-title' })}`, { token: studentToken })
    expect(byTitle.status).toBe(200)
    expect(count(byTitle)).toBe(1)
  })

  it.each<[string, Record<string, string>]>([
    ['ссылка на видео', { 'where[content.videoUrl][contains]': 'disk.yandex' }],
    ['вложенная запись пути', { 'where[content][videoUrl][contains]': 'disk.yandex' }],
    ['папка презентации', { 'where[content.folderUrl][contains]': 'disk.yandex' }],
    ['файл презентации', { 'where[content.items.url][like]': 'guide' }],
    ['условие внутри or', { 'where[or][0][title][equals]': 'нет', 'where[or][1][content.videoUrl][contains]': 'disk' }],
    ['условие внутри and → or', { 'where[and][0][or][0][content.url][contains]': 'disk' }],
    ['путь с двойным подчёркиванием', { 'where[content__videoUrl][contains]': 'disk.yandex' }],
    ['сортировка', { sort: 'content.videoUrl' }],
    ['сортировка с двойным подчёркиванием', { sort: '-content__folderUrl' }],
    ['обратная сортировка в списке', { sort: 'title,-content.folderUrl' }],
  ])('ученику отказано: %s', async (_label, params) => {
    // Подсчёт сортировку не принимает, поэтому для неё проверяется только список.
    for (const path of 'sort' in params ? ['/lessons'] : ['/lessons', '/lessons/count']) {
      const response = await rest('GET', `${path}${query(params)}`, { token: studentToken })
      expect(response.status, path).toBe(403)
      expect(response.json.totalDocs, path).toBeUndefined()
    }
  })

  it('через связь с уроком содержимое тоже не фильтруется', async () => {
    const own = await rest('GET', `/notes${query({ 'where[lesson][equals]': String(lessonId) })}`, { token: studentToken })
    expect(own.status).toBe(200)
    expect(count(own)).toBe(1)
    const attempts: Array<Record<string, string>> = [
      { 'where[lesson.content.videoUrl][contains]': 'disk.yandex' },
      { 'where[lesson.content.folderUrl][contains]': 'disk' },
      { 'where[lesson][content.videoUrl][contains]': 'disk' },
      { sort: 'lesson.content.videoUrl' },
      { 'where[lesson__content__videoUrl][contains]': 'disk' },
    ]
    for (const params of attempts) {
      const response = await rest('GET', `/notes${query(params)}`, { token: studentToken })
      expect(response.status, JSON.stringify(params)).toBe(403)
    }
  })

  it('связь с уроком под другим именем защита находит по конфигурации', async () => {
    // В правилах доступа урок лежит в поле target — связи сразу с несколькими коллекциями.
    const attempts: Array<Record<string, string>> = [{ 'where[target.value.content.videoUrl][contains]': 'disk' }, { 'where[target.content.folderUrl][contains]': 'disk' }]
    for (const params of attempts) {
      const response = await rest('GET', `/learning-access-grants${query(params)}`, { token: studentToken })
      expect(response.status, JSON.stringify(params)).toBe(403)
      expect(JSON.stringify(response.json), JSON.stringify(params)).toContain('Фильтр и сортировка по содержимому урока недоступны')
    }
  })

  it('администратор фильтрует по источникам: так ищут уроки с конкретным файлом', async () => {
    const found = await rest('GET', `/lessons${query({ 'where[content.videoUrl][contains]': KEY, depth: '0' })}`, { token: adminToken })
    expect(found.status).toBe(200)
    expect(count(found)).toBe(1)
    const slides = await rest('GET', `/lessons${query({ 'where[content.items.url][contains]': `${KEY}/guide`, depth: '0' })}`, { token: adminToken })
    expect(count(slides)).toBe(1)
    // Payload понимает и запись через двойное подчёркивание — поэтому защита обязана её учитывать.
    const underscored = await rest('GET', `/lessons${query({ 'where[content__videoUrl][contains]': KEY, depth: '0' })}`, { token: adminToken })
    expect(count(underscored)).toBe(1)
  })
})
