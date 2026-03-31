'use client'

import { VideoPlayer } from './VideoPlayer'
import { MiroEmbed } from './MiroEmbed'
import { ExternalLinkBlock } from './ExternalLink'
import { MarkdownRenderer } from './MarkdownRenderer'
import { FileDown } from 'lucide-react'

type ContentBlock = {
  id?: string | null
  blockType: string
  [key: string]: unknown
}

type Props = {
  blocks: ContentBlock[]
}

/**
 * Полиморфный рендерер для контент-блоков уроков.
 * Каждый blockType рендерится соответствующим компонентом.
 */
export function ContentBlockRenderer({ blocks }: Props) {
  if (!blocks || blocks.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">В этом уроке пока нет контента</p>
    )
  }

  return (
    <div className="space-y-6">
      {blocks.map((block, index) => (
        <div key={block.id ?? index}>
          {renderBlock(block)}
        </div>
      ))}
    </div>
  )
}

function renderBlock(block: ContentBlock) {
  switch (block.blockType) {
    case 'text':
      return renderTextBlock(block)
    case 'video':
      return renderVideoBlock(block)
    case 'image':
      return renderImageBlock(block)
    case 'link':
      return renderLinkBlock(block)
    case 'miro':
      return renderMiroBlock(block)
    case 'file':
      return renderFileBlock(block)
    default:
      return null
  }
}

function renderTextBlock(block: ContentBlock) {
  // Lexical richText хранится как JSON-объект, нужно конвертировать в Markdown/HTML
  // В простом случае — рендерим через Payload's серверный конвертер
  // Для клиентского рендеринга используем текстовое представление
  const content = block.content

  if (typeof content === 'string') {
    return <MarkdownRenderer content={content} />
  }

  // Если это Lexical JSON — конвертируем в React
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <LexicalContent data={content as Record<string, unknown>} />
      </div>
    )
  }

  return null
}

function renderVideoBlock(block: ContentBlock) {
  return (
    <VideoPlayer
      title={block.title as string}
      videoUrl={block.videoUrl as string}
      displayMode={(block.displayMode as 'embed' | 'link') ?? 'embed'}
      description={block.description as string | null}
      durationMinutes={block.durationMinutes as number | null}
    />
  )
}

function renderImageBlock(block: ContentBlock) {
  const image = block.image as { url?: string; alt?: string } | null

  if (!image?.url) return null

  return (
    <figure className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={(block.altText as string) ?? image.alt ?? ''}
          className="w-full object-contain"
        />
      </div>
      {typeof block.caption === 'string' && block.caption && (
        <figcaption className="text-center text-sm text-muted-foreground">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

function renderLinkBlock(block: ContentBlock) {
  return (
    <ExternalLinkBlock
      title={block.title as string}
      url={block.url as string}
      platform={block.platform as 'boosty' | 'telegram' | 'youtube' | 'github' | 'other' | null}
      description={block.description as string | null}
    />
  )
}

function renderMiroBlock(block: ContentBlock) {
  return (
    <MiroEmbed
      title={block.title as string}
      embedUrl={block.embedUrl as string}
      height={block.height as number | null}
    />
  )
}

function renderFileBlock(block: ContentBlock) {
  const file = block.file as { url?: string; filename?: string } | null

  if (!file?.url) return null

  return (
    <a
      href={file.url}
      download
      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
        <FileDown className="h-5 w-5 text-info" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-foreground group-hover:text-primary transition-colors">
          {String(block.title)}
        </p>
        {typeof block.description === 'string' && block.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{block.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{file.filename ?? 'Скачать файл'}</p>
      </div>
    </a>
  )
}

/**
 * Простой рендерер для Lexical JSON-контента.
 * Конвертирует базовые ноды Lexical в HTML.
 */
/** Извлекает текст из Lexical-нода рекурсивно. */
function extractText(node: LexicalNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'linebreak') return '\n'
  return (node.children ?? []).map(extractText).join('')
}

function LexicalContent({ data }: { data: Record<string, unknown> }) {
  const root = data as { root?: { children?: LexicalNode[] } }
  if (!root.root?.children) return null

  return <>{root.root.children.map((node, i) => <LexicalNode key={i} node={node} />)}</>
}

type LexicalNode = {
  type: string
  tag?: string
  text?: string
  format?: number
  children?: LexicalNode[]
  listType?: string
  url?: string
  language?: string
  [key: string]: unknown
}

function LexicalNode({ node }: { node: LexicalNode }) {
  if (node.type === 'text') {
    let content: React.ReactNode = node.text ?? ''

    // Format bitmask: 1=bold, 2=italic, 4=strikethrough, 8=underline, 16=code
    if (node.format) {
      if (node.format & 16) content = <code className="rounded bg-secondary px-1.5 py-0.5 text-sm">{content}</code>
      if (node.format & 1) content = <strong>{content}</strong>
      if (node.format & 2) content = <em>{content}</em>
      if (node.format & 4) content = <s>{content}</s>
      if (node.format & 8) content = <u>{content}</u>
    }

    return <>{content}</>
  }

  const children = node.children?.map((child, i) => <LexicalNode key={i} node={child} />)

  switch (node.type) {
    case 'paragraph':
      return <p>{children}</p>
    case 'heading': {
      const tag = (node.tag ?? 'h2') as string
      switch (tag) {
        case 'h1': return <h1>{children}</h1>
        case 'h2': return <h2>{children}</h2>
        case 'h3': return <h3>{children}</h3>
        case 'h4': return <h4>{children}</h4>
        case 'h5': return <h5>{children}</h5>
        case 'h6': return <h6>{children}</h6>
        default: return <h2>{children}</h2>
      }
    }
    case 'list':
      if (node.listType === 'number') return <ol>{children}</ol>
      return <ul>{children}</ul>
    case 'listitem':
      return <li>{children}</li>
    case 'link': {
      const url = String(node.url ?? '').trim()
      const isSafeUrl = /^(https?:|\/|mailto:)/.test(url)
      if (!isSafeUrl) return <>{children}</>
      return (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    }
    case 'quote':
      return <blockquote>{children}</blockquote>
    case 'horizontalrule':
      return <hr className="my-6 border-border" />
    case 'code': {
      // Lexical code block: children contain text nodes with code
      const codeText = extractText(node)
      const lang = node.language ?? ''
      return (
        <pre className="overflow-x-auto rounded-xl border border-border bg-secondary p-4">
          <code className={lang ? `language-${lang}` : ''}>{codeText}</code>
        </pre>
      )
    }
    case 'linebreak':
      return <br />
    default:
      return <>{children}</>
  }
}
