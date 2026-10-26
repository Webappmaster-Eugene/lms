import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import type { Course, Roadmap, RoadmapNode } from '@/payload-types'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { CourseCatalogue } = await import('@/components/content-management/CourseCatalogue')
const { ManagementHeading, PublicationStatus } = await import('@/components/content-management/ManagementHeading')

/**
 * Список курсов в разделе управления: администратор ищет курс по названию
 * и теме карты, а пустой результат подсказывает следующий шаг.
 */

const timestamp = '2026-10-04T10:00:00.000Z'
const roadmaps: Roadmap[] = [
  { id: 1, title: 'Backend Node.js', slug: 'backend', isPublished: true, updatedAt: timestamp, createdAt: timestamp },
  { id: 2, title: 'Frontend React', slug: 'frontend', isPublished: true, updatedAt: timestamp, createdAt: timestamp },
]
const course = (id: number, title: string, overrides: Partial<Course> = {}): Course => ({
  id, title, slug: `course-${id}`, roadmap: 1, isPublished: true, updatedAt: timestamp, createdAt: timestamp, ...overrides,
})
const node = (id: number, label: string, nodeType: RoadmapNode['nodeType']): RoadmapNode => ({
  id, nodeId: `node-${id}`, label, nodeType, roadmap: 1, positionX: 0, positionY: 0, updatedAt: timestamp, createdAt: timestamp,
})
const courses = [
  course(5, 'Node.js с нуля', { roadmapNode: 11 }),
  course(6, 'Express и REST', { roadmapNode: { ...node(12, 'HTTP', 'topic') }, isPublished: false }),
  course(7, 'React-хуки', { roadmap: { ...roadmaps[1] } }),
]
const titles = () => within(screen.getByRole('list')).getAllByRole('link', { name: /^(?!Программа)/ }).map((link) => link.textContent)

describe('каталог курсов для редактирования', () => {
  it('показывает курсы со статусом публикации, роадмапом и ссылкой на программу', () => {
    render(<CourseCatalogue courses={courses} roadmaps={roadmaps} />)

    expect(titles()).toEqual(['Node.js с нуля', 'Express и REST', 'React-хуки'])
    const express = screen.getByRole('link', { name: 'Express и REST' }).closest('li') as HTMLElement
    expect(within(express).getByText('Черновик')).toBeInTheDocument()
    expect(within(express).getByText('Backend Node.js')).toBeInTheDocument()
    expect(within(express).getByRole('link', { name: 'Программа курса «Express и REST»' })).toHaveAttribute('href', '/manage/courses/6')
    const react = screen.getByRole('link', { name: 'React-хуки' }).closest('li') as HTMLElement
    expect(within(react).getByText('Опубликован')).toBeInTheDocument()
    expect(within(react).getByText('Frontend React')).toBeInTheDocument()
  })

  it('ищет по названию без учёта регистра и пробелов по краям', () => {
    render(<CourseCatalogue courses={courses} roadmaps={roadmaps} query="  EXPRESS " />)

    expect(titles()).toEqual(['Express и REST'])
    expect(screen.getByRole('searchbox', { name: 'Найти курс' })).toHaveValue('  EXPRESS ')
  })

  it('фильтрует по теме карты, а в списке тем нет категорий', () => {
    const nodes = [node(10, 'Основы', 'category'), node(11, 'Node.js', 'topic'), node(12, 'HTTP', 'subtopic')]
    render(<CourseCatalogue courses={courses} roadmaps={roadmaps} nodes={nodes} roadmapId={1} nodeId={12} />)

    expect(titles()).toEqual(['Express и REST'])
    const topic = screen.getByRole('combobox', { name: 'Тема карты' })
    expect(topic).toHaveValue('12')
    expect(within(topic).getAllByRole('option').map((option) => option.textContent)).toEqual(['Все темы', 'Node.js', 'HTTP'])
  })

  it('без списка тем поле темы не показывается', () => {
    render(<CourseCatalogue courses={courses} roadmaps={roadmaps} />)

    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Тема карты' })).not.toBeInTheDocument()
  })

  it('пустой каталог предлагает добавить первый курс в выбранную тему', () => {
    render(<CourseCatalogue courses={[]} roadmaps={roadmaps} roadmapId={1} />)

    expect(screen.getByRole('heading', { name: 'Добавьте первый курс' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Добавить курс' })).toHaveAttribute('href', '/manage/courses/new?roadmap=1')
  })

  it('ничего не нашлось — предлагает изменить поиск и создать курс для темы', () => {
    render(<CourseCatalogue courses={courses} roadmaps={roadmaps} roadmapId={1} nodeId={99} />)

    expect(screen.getByRole('heading', { name: 'Курсы не найдены' })).toBeInTheDocument()
    expect(screen.getByText('Измените поиск или создайте курс для этой темы.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Добавить курс' })).toHaveAttribute('href', '/manage/courses/new?roadmap=1&node=99')
  })

  it('без роадмапа новый курс создаётся без привязки', () => {
    render(<CourseCatalogue courses={courses} roadmaps={roadmaps} query="Go" />)

    expect(screen.getByRole('heading', { name: 'Курсы не найдены' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Добавить курс' })).toHaveAttribute('href', '/manage/courses/new')
  })
})

describe('шапка раздела управления', () => {
  it('ведёт крошками от «Учебного контента» к текущей странице', () => {
    render(<ManagementHeading title="Node.js" breadcrumbs={[{ href: '/manage/roadmaps/1', label: 'Backend' }, { href: '/manage/courses/5', label: 'Node.js' }]} />)

    const path = screen.getByRole('navigation', { name: 'Путь к учебному контенту' })
    expect(within(path).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Учебный контент', '/manage'],
      ['Backend', '/manage/roadmaps/1'],
      ['Node.js', '/manage/courses/5'],
    ])
    expect(screen.getByRole('heading', { level: 1, name: 'Node.js' })).toBeInTheDocument()
  })

  it('описание и действия выводятся, только когда заданы', () => {
    const view = render(<ManagementHeading title="Курсы" />)
    expect(view.container.querySelector('p')).toBeNull()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    view.rerender(<ManagementHeading title="Курсы" description="Все курсы платформы" actions={<button type="button">Новый курс</button>} />)
    expect(screen.getByText('Все курсы платформы')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Новый курс' })).toBeInTheDocument()
  })

  it('статус публикации различает опубликованный материал и черновик', () => {
    const view = render(<PublicationStatus published />)
    expect(screen.getByText('Опубликован')).toBeInTheDocument()
    view.rerender(<PublicationStatus published={false} />)
    expect(screen.getByText('Черновик')).toBeInTheDocument()
  })
})
