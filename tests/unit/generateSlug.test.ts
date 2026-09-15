import { describe, expect, it } from 'vitest'

import { generateSlug } from '@/payload/hooks/generateSlug'

/**
 * Slug попадает прямо в URL, поэтому автогенерация обязана давать только
 * латиницу, цифры и дефис.
 */

type Data = Record<string, unknown>

function run(data: Data, operation: 'create' | 'update' = 'create'): Data {
  // @ts-expect-error — хуку достаточно data и operation
  return generateSlug({ data, operation, req: {}, collection: { slug: 'courses' } }) as Data
}

describe('генерация slug', () => {
  describe('транслитерация', () => {
    it.each([
      ['Основы JavaScript', 'osnovy-javascript'],
      ['Глубокий React', 'glubokiy-react'],
      ['Ёлка и Ёж', 'yolka-i-yozh'],
      ['Щука, объект и подъезд', 'shchuka-obekt-i-podezd'],
      ['Тестирование', 'testirovanie'],
    ])('«%s» → %s', (title, expected) => {
      expect(run({ title })).toMatchObject({ slug: expected })
    })
  })

  describe('форма слага', () => {
    it.each([
      ['Next.js: App Router', 'next-js-app-router'],
      ['Node.js и NestJS', 'node-js-i-nestjs'],
      ['  Пробелы   по   краям  ', 'probely-po-krayam'],
      ['Спец!@#символы$%^', 'spets-simvoly'],
      ['--- уже с дефисами ---', 'uzhe-s-defisami'],
      ['CI/CD и Docker', 'ci-cd-i-docker'],
      ['Курс 2.0', 'kurs-2-0'],
    ])('«%s» → %s', (title, expected) => {
      expect(run({ title })).toMatchObject({ slug: expected })
    })

    it.each([
      'Next.js: App Router',
      'CI/CD и Docker',
      'Курс 2.0',
      'array.map и filter',
      'путь/с/слешами',
    ])('в слаге из «%s» нет точек и слешей', (title) => {
      const slug = String(run({ title }).slug)

      expect(slug).toMatch(/^[a-z0-9-]+$/)
      expect(slug).not.toContain('.')
      expect(slug).not.toContain('/')
    })
  })

  describe('когда slug не трогается', () => {
    it('заданный вручную слаг сохраняется как есть', () => {
      expect(run({ title: 'Глубокий React', slug: 'deep-react' })).toMatchObject({
        slug: 'deep-react',
      })
    })

    it('при обновлении с уже заполненным слагом он не перегенерируется', () => {
      expect(run({ title: 'Новое название', slug: 'staryy-slag' }, 'update')).toMatchObject({
        slug: 'staryy-slag',
      })
    })

    it('при обновлении без слага он достраивается из названия', () => {
      expect(run({ title: 'Глубокий React' }, 'update')).toMatchObject({ slug: 'glubokiy-react' })
    })

    it('без названия слаг не выдумывается', () => {
      expect(run({}).slug).toBeUndefined()
    })

    it('отсутствующая data возвращается без изменений', () => {
      // @ts-expect-error — Payload действительно может передать undefined
      expect(generateSlug({ data: undefined, operation: 'create' })).toBeUndefined()
    })
  })

  describe('ручной слаг хук не санирует', () => {
    it('точка в слаге, введённом руками, останется', () => {
      // CMS позволяет вписать произвольный слаг — защита остаётся на middleware.
      expect(run({ title: 'Next.js', slug: 'next.js' })).toMatchObject({ slug: 'next.js' })
    })
  })
})
