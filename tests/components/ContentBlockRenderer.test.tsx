import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/lesson/VideoPlayer', () => ({
  VideoPlayer: ({ title }: { title: string }) => <div data-testid="video">{title}</div>,
}))
vi.mock('@/components/lesson/MiroEmbed', () => ({
  MiroEmbed: ({ title }: { title: string }) => <div data-testid="miro">{title}</div>,
}))

const { ContentBlockRenderer } = await import('@/components/lesson/ContentBlockRenderer')

/**
 * Сборка урока из блоков, заданных в CMS.
 *
 * Блоки приходят из базы, где поля необязательны, поэтому каждый вид обязан
 * пережить отсутствие вложения: битая картинка не должна ронять весь урок.
 */

type Block = Record<string, unknown> & { blockType: string }

const renderBlocks = (blocks: Block[]) => render(<ContentBlockRenderer blocks={blocks} />)

/** Лексический документ с одним абзацем. */
function lexical(text: string) {
  return {
    root: {
      children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
    },
  }
}

describe('содержимое урока', () => {
  describe('пустой урок', () => {
    it('честно сообщает, что контента нет', () => {
      renderBlocks([])

      expect(screen.getByText('В этом уроке пока нет контента')).toBeInTheDocument()
    })

    it('отсутствие блоков вовсе обрабатывается так же', () => {
      render(<ContentBlockRenderer blocks={undefined as never} />)

      expect(screen.getByText('В этом уроке пока нет контента')).toBeInTheDocument()
    })
  })

  describe('виды блоков', () => {
    it('текст выводится', () => {
      renderBlocks([{ blockType: 'text', content: lexical('Теория урока') }])

      expect(screen.getByText('Теория урока')).toBeInTheDocument()
    })

    it('видео отдаётся плееру', () => {
      renderBlocks([{ blockType: 'video', title: 'Введение', videoUrl: 'https://disk/1' }])

      expect(screen.getByTestId('video')).toHaveTextContent('Введение')
    })

    it('доска Miro встраивается', () => {
      renderBlocks([{ blockType: 'miro', title: 'Карта', embedUrl: 'https://miro/1' }])

      expect(screen.getByTestId('miro')).toHaveTextContent('Карта')
    })

    it('картинка показывается с описанием', () => {
      renderBlocks([
        { blockType: 'image', image: { url: '/p.png', alt: 'Схема' }, caption: 'Схема потока' },
      ])

      expect(screen.getByRole('img')).toHaveAttribute('src', '/p.png')
      expect(screen.getByText('Схема потока')).toBeInTheDocument()
    })

    it('файл отдаётся ссылкой на скачивание', () => {
      renderBlocks([{ blockType: 'file', file: { url: '/a.pdf', filename: 'Конспект.pdf' } }])

      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/a.pdf')
      expect(link).toHaveAttribute('download')
    })

    it('внешняя ссылка открывается в новой вкладке', () => {
      renderBlocks([
        { blockType: 'link', title: 'Исходники', url: 'https://github.com/x', platform: 'github' },
      ])

      expect(screen.getByRole('link')).toHaveAttribute('target', '_blank')
    })
  })

  describe('неполные данные из CMS', () => {
    it('картинка без файла пропускается, а не рушит урок', () => {
      renderBlocks([
        { blockType: 'image', image: null },
        { blockType: 'text', content: lexical('А это осталось') },
      ])

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.getByText('А это осталось')).toBeInTheDocument()
    })

    it('файл без вложения пропускается', () => {
      renderBlocks([{ blockType: 'file', file: null }])

      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('незнакомый вид блока молча пропускается', () => {
      renderBlocks([
        { blockType: 'какой-то-новый', data: {} },
        { blockType: 'text', content: lexical('Соседний блок') },
      ])

      expect(screen.getByText('Соседний блок')).toBeInTheDocument()
    })
  })

  describe('порядок и состав', () => {
    it('блоки идут в заданном порядке', () => {
      const { container } = renderBlocks([
        { blockType: 'text', content: lexical('Первый') },
        { blockType: 'text', content: lexical('Второй') },
      ])

      expect(container.textContent?.indexOf('Первый')).toBeLessThan(
        container.textContent?.indexOf('Второй') ?? -1,
      )
    })

    it('несколько разных блоков выводятся вместе', () => {
      renderBlocks([
        { blockType: 'text', content: lexical('Теория') },
        { blockType: 'video', title: 'Практика', videoUrl: 'https://disk/1' },
      ])

      expect(screen.getByText('Теория')).toBeInTheDocument()
      expect(screen.getByTestId('video')).toBeInTheDocument()
    })
  })

  describe('текстовый блок', () => {
    it('заголовки уровня h2 выводятся заголовками', () => {
      renderBlocks([
        {
          blockType: 'text',
          content: {
            root: {
              children: [
                { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Раздел' }] },
              ],
            },
          },
        },
      ])

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Раздел')
    })

    it('пустой документ не рисует пустой блок', () => {
      renderBlocks([{ blockType: 'text', content: { root: {} } }])

      expect(screen.queryByText('В этом уроке пока нет контента')).not.toBeInTheDocument()
    })
  })
})
