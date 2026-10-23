'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ComponentProps } from 'react'
import Markdown, { defaultUrlTransform, type Components, type ExtraProps, type UrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { HighlighterCore } from 'shiki/core'

import { lessonHashTarget, lessonMarkdownOutline, type LessonMarkdownOutline } from '@/lib/lesson-markdown'
import { getMarkdownHighlighter, markdownLanguage } from '@/lib/markdown-highlighter'

import { CodeBlock } from './CodeBlock'
import { LessonContents } from './LessonContents'
import { MarkdownImage } from './MarkdownImage'

/** Длиннее блок кода подсвечивать нет смысла: его копируют, а не читают. */
const MAX_HIGHLIGHTED = 20_000
/** Оглавление нужно длинному уроку; два заголовка видно и так. */
const MIN_CONTENTS = 3

/** Схемы методичек встроены в текст картинками; другие data:-адреса не пропускаются. */
const IMAGE_DATA_URI = /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

type HastNode = { type: string; tagName?: string; value?: string; properties?: { className?: unknown }; children?: HastNode[] }

function hastText(node: HastNode): string {
  return node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(hastText).join('')
}

/** Язык из метки блока кода, как её написал автор: `ts`, `sh`, `text`. */
function fenceLanguage(className: unknown): string | null {
  const classes = Array.isArray(className) ? className.map(String) : typeof className === 'string' ? className.split(/\s+/) : []
  const language = classes.find((name) => name.startsWith('language-'))
  return language ? language.slice('language-'.length).toLowerCase() : null
}

export const lessonMarkdownUrl: UrlTransform = (url, key, node) => (
  key === 'src' && node.tagName === 'img' && IMAGE_DATA_URI.test(url) ? url : defaultUrlTransform(url)
)

const PROSE = [
  'prose prose-sm dark:prose-invert max-w-none break-words sm:prose-base',
  'prose-headings:scroll-mt-20 prose-headings:text-foreground prose-a:text-primary prose-a:underline-offset-2 prose-strong:text-foreground',
  'prose-li:marker:text-muted-foreground prose-hr:border-border',
  'prose-code:rounded prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none',
  'prose-blockquote:rounded-r-lg prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:pr-4 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-foreground [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none',
  'prose-table:my-0 prose-thead:border-border prose-tr:border-border prose-th:bg-muted/60 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2',
].join(' ')

type LessonMarkdownState = { highlighter: HighlighterCore | null; outline: LessonMarkdownOutline }

const EMPTY_OUTLINE: LessonMarkdownOutline = { anchors: new Map(), contents: [], count: 0, aliases: new Map() }

/**
 * Подсветка и якоря приходят контекстом, а не замыканием в components: иначе загрузка
 * подсветки меняла бы типы компонентов, React пересоздавал бы блоки кода и схемы и
 * сбрасывал их состояние («Скопировано», открытый просмотр схемы).
 */
const LessonMarkdownContext = createContext<LessonMarkdownState>({ highlighter: null, outline: EMPTY_OUTLINE })

function LessonH2({ node, children, ...props }: ComponentProps<'h2'> & ExtraProps) {
  const { outline } = useContext(LessonMarkdownContext)
  return <h2 {...props} id={outline.anchors.get(node?.position?.start.offset ?? -1)}>{children}</h2>
}

function LessonH3({ node, children, ...props }: ComponentProps<'h3'> & ExtraProps) {
  const { outline } = useContext(LessonMarkdownContext)
  return <h3 {...props} id={outline.anchors.get(node?.position?.start.offset ?? -1)}>{children}</h3>
}

function LessonLink({ node: _node, href, children, ...props }: ComponentProps<'a'> & ExtraProps) {
  const { outline } = useContext(LessonMarkdownContext)
  const external = typeof href === 'string' && /^https?:\/\//.test(href)
  const target = typeof href === 'string' ? lessonHashTarget(href, outline) : href
  return <a {...props} href={target} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
}

function LessonPre({ node, children, ...props }: ComponentProps<'pre'> & ExtraProps) {
  const { highlighter } = useContext(LessonMarkdownContext)
  const code: HastNode | undefined = node?.children[0]
  const fence = code?.tagName === 'code' ? fenceLanguage(code.properties?.className) : null
  const language = fence ? markdownLanguage(fence) : null
  const text = code ? hastText(code).replace(/\n$/, '') : ''
  if (highlighter && language && highlighter.getLoadedLanguages().includes(language) && text.length <= MAX_HIGHLIGHTED) {
    const html = highlighter.codeToHtml(text, { lang: language, themes: { light: 'github-light', dark: 'github-dark' } })
    return (
      <CodeBlock code={text} language={fence}>
        <div className="text-sm [&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      </CodeBlock>
    )
  }
  return (
    <CodeBlock code={text} language={fence}>
      <pre {...props} className="overflow-x-auto bg-secondary p-4 text-sm leading-relaxed text-foreground">{children}</pre>
    </CodeBlock>
  )
}

const components: Components = {
  h2: LessonH2,
  h3: LessonH3,
  a: LessonLink,
  img: ({ node: _node, src, alt }) => <MarkdownImage src={typeof src === 'string' && src ? src : undefined} alt={alt} />,
  // Широкая таблица прокручивается сама, а не растягивает страницу на телефоне.
  table: ({ node: _node, ...props }) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-border">
      <table {...props} />
    </div>
  ),
  pre: LessonPre,
}

const REMARK_PLUGINS = [remarkGfm]

/**
 * Текст урока из Markdown-репозитория. Сырой HTML не исполняется: rehype-raw здесь
 * намеренно не подключён, в отличие от MarkdownRenderer. Код подсвечивается в
 * браузере после загрузки, до неё он читается обычным блоком.
 */
export function LessonMarkdown({ markdown, anchorPrefix = 'section' }: { markdown: string; anchorPrefix?: string }) {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null)
  const outline = useMemo(() => lessonMarkdownOutline(markdown, anchorPrefix), [markdown, anchorPrefix])
  const state = useMemo(() => ({ highlighter, outline }), [highlighter, outline])
  const languageKey = useMemo(
    () => [...new Set([...markdown.matchAll(/^ {0,3}(?:```|~~~)([\w-]+)/gm)].map((match) => markdownLanguage(match[1].toLowerCase())))].sort().join(','),
    [markdown],
  )
  // Загрузка подсветки не разбирает текст заново: перерисуются только блоки кода.
  const content = useMemo(() => (
    <Markdown remarkPlugins={REMARK_PLUGINS} components={components} urlTransform={lessonMarkdownUrl}>
      {markdown}
    </Markdown>
  ), [markdown])

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

  return (
    <LessonMarkdownContext.Provider value={state}>
      <div className="space-y-6">
        {outline.count >= MIN_CONTENTS && <LessonContents items={outline.contents} count={outline.count} />}
        <div className={PROSE}>{content}</div>
      </div>
    </LessonMarkdownContext.Provider>
  )
}
