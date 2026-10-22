'use client'

import { useEffect, useMemo, useState } from 'react'
import Markdown, { defaultUrlTransform, type Components, type UrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { HighlighterCore } from 'shiki/core'

import { getMarkdownHighlighter, markdownLanguage } from '@/lib/markdown-highlighter'

/** Длиннее блок кода подсвечивать нет смысла: его копируют, а не читают. */
const MAX_HIGHLIGHTED = 20_000

/** Схемы методичек встроены в текст картинками; другие data:-адреса не пропускаются. */
const IMAGE_DATA_URI = /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

type HastNode = { type: string; tagName?: string; value?: string; properties?: { className?: unknown }; children?: HastNode[] }

function hastText(node: HastNode): string {
  return node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(hastText).join('')
}

function codeLanguage(className: unknown): string | null {
  const classes = Array.isArray(className) ? className.map(String) : typeof className === 'string' ? className.split(/\s+/) : []
  const language = classes.find((name) => name.startsWith('language-'))
  return language ? markdownLanguage(language.slice('language-'.length).toLowerCase()) : null
}

/**
 * Схема в своём размере, но не шире колонки. На телефоне широкая схема не сжимается
 * уже 560 px, где подписи ещё читаются, а прокручивается внутри рамки.
 */
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [width, setWidth] = useState(0)
  return (
    <span className="not-prose my-6 block overflow-x-auto rounded-xl border border-border bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        className="mx-auto block h-auto max-w-full"
        style={width ? { minWidth: `min(${width}px, 560px)` } : undefined}
        onLoad={(event) => setWidth(event.currentTarget.naturalWidth)}
      />
    </span>
  )
}

export const lessonMarkdownUrl: UrlTransform = (url, key, node) => (
  key === 'src' && node.tagName === 'img' && IMAGE_DATA_URI.test(url) ? url : defaultUrlTransform(url)
)

const PROSE = [
  'prose prose-sm dark:prose-invert max-w-none break-words sm:prose-base',
  'prose-headings:scroll-mt-20 prose-headings:text-foreground prose-a:text-primary prose-a:underline-offset-2 prose-strong:text-foreground',
  'prose-li:marker:text-muted-foreground prose-hr:border-border',
  'prose-code:rounded prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:bg-secondary prose-pre:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  'prose-blockquote:rounded-r-lg prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:pr-4 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-foreground [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none',
  'prose-table:my-0 prose-thead:border-border prose-tr:border-border prose-th:bg-muted/60 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2',
].join(' ')

/**
 * Текст урока из Markdown-репозитория. Сырой HTML не исполняется: rehype-raw здесь
 * намеренно не подключён, в отличие от MarkdownRenderer. Код подсвечивается в
 * браузере после загрузки, до неё он читается обычным блоком.
 */
export function LessonMarkdown({ markdown }: { markdown: string }) {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null)
  const languageKey = useMemo(
    () => [...new Set([...markdown.matchAll(/^ {0,3}(?:```|~~~)([\w-]+)/gm)].map((match) => markdownLanguage(match[1].toLowerCase())))].sort().join(','),
    [markdown],
  )

  useEffect(() => {
    if (!languageKey) return
    let cancelled = false
    getMarkdownHighlighter(languageKey.split(',')).then(
      (instance) => { if (!cancelled) setHighlighter(instance) },
      (error: unknown) => {
        // Без подсветки код остаётся читаемым; причину видно в консоли.
        console.warn('Не удалось загрузить подсветку кода урока', error)
      },
    )
    return () => { cancelled = true }
  }, [languageKey])

  const components = useMemo<Components>(() => ({
    a: ({ node: _node, href, children, ...props }) => {
      const external = typeof href === 'string' && /^https?:\/\//.test(href)
      return <a {...props} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
    },
    img: ({ node: _node, src, alt }) => <MarkdownImage src={typeof src === 'string' ? src : undefined} alt={alt} />,
    // Широкая таблица прокручивается сама, а не растягивает страницу на телефоне.
    table: ({ node: _node, ...props }) => (
      <div className="my-6 overflow-x-auto rounded-xl border border-border">
        <table {...props} />
      </div>
    ),
    pre: ({ node, children, ...props }) => {
      const code: HastNode | undefined = node?.children[0]
      const language = code?.tagName === 'code' ? codeLanguage(code.properties?.className) : null
      const text = code ? hastText(code).replace(/\n$/, '') : ''
      if (highlighter && language && highlighter.getLoadedLanguages().includes(language) && text.length <= MAX_HIGHLIGHTED) {
        const html = highlighter.codeToHtml(text, { lang: language, themes: { light: 'github-light', dark: 'github-dark' } })
        return <div className="not-prose my-5 overflow-hidden rounded-xl border border-border text-sm [&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      }
      return <pre {...props}>{children}</pre>
    },
  }), [highlighter])

  return (
    <div className={PROSE}>
      <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={lessonMarkdownUrl}>
        {markdown}
      </Markdown>
    </div>
  )
}
