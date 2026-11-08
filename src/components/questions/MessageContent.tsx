'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ComponentProps } from 'react'
import Link from 'next/link'
import Markdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Play } from 'lucide-react'
import type { HighlighterCore } from 'shiki/core'

import { CodeBlock } from '@/components/lesson/CodeBlock'
import { getMarkdownHighlighter, markdownLanguage } from '@/lib/markdown-highlighter'
import { rehypeTimestamps, TIMESTAMP_PROPERTY } from '@/lib/message-markdown'
import { VIDEO_SEEK_EVENT } from '@/lib/video-memory'
import { cn } from '@/lib/utils'

/**
 * Куда ведёт таймкод: на странице урока - перемотка его видео, в списках
 * вопросов - ссылка на урок с этой секундой, без видео - просто текст.
 */
export type TimestampTarget = { kind: 'seek' } | { kind: 'link'; lessonSlug: string } | null

/** Длинный блок кода не подсвечиваем: его копируют, а не читают. */
const MAX_HIGHLIGHTED = 20_000

type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] }

const hastText = (node: HastNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(hastText).join('')

function fenceLanguage(className: unknown): string | null {
  const classes = Array.isArray(className) ? className.map(String) : typeof className === 'string' ? className.split(/\s+/) : []
  const language = classes.find((name) => name.startsWith('language-'))
  return language ? language.slice('language-'.length).toLowerCase() : null
}

type State = { highlighter: HighlighterCore | null; timestamps: TimestampTarget }

/** Подсветка приходит контекстом: иначе её загрузка пересоздавала бы блоки кода и сбрасывала «Скопировано». */
const MessageContext = createContext<State>({ highlighter: null, timestamps: null })

function MessagePre({ node, children, ...props }: ComponentProps<'pre'> & ExtraProps) {
  const { highlighter } = useContext(MessageContext)
  const code = node?.children[0] as HastNode | undefined
  const fence = code?.tagName === 'code' ? fenceLanguage(code.properties?.className) : null
  const language = fence ? markdownLanguage(fence) : null
  const text = code ? hastText(code).replace(/\n$/, '') : ''
  if (highlighter && language && highlighter.getLoadedLanguages().includes(language) && text.length <= MAX_HIGHLIGHTED) {
    const html = highlighter.codeToHtml(text, { lang: language, themes: { light: 'github-light', dark: 'github-dark' } })
    return (
      <CodeBlock code={text} language={fence}>
        <div className="text-[13px] [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      </CodeBlock>
    )
  }
  return (
    <CodeBlock code={text} language={fence}>
      <pre {...props} className="overflow-x-auto bg-secondary p-3 text-[13px] leading-relaxed text-foreground">{children}</pre>
    </CodeBlock>
  )
}

function MessageLink({ node, href, children, ...props }: ComponentProps<'a'> & ExtraProps) {
  const { timestamps } = useContext(MessageContext)
  const stamp = node?.properties?.[TIMESTAMP_PROPERTY]
  if (stamp !== undefined) {
    const seconds = Number(stamp)
    if (timestamps?.kind === 'seek') {
      return (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(VIDEO_SEEK_EVENT, { detail: { seconds } }))}
          aria-label={`Перейти к ${hastText(node as HastNode)} в видео`}
          className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 align-baseline font-medium tabular-nums text-foreground no-underline transition-colors hover:bg-primary/20"
        >
          <Play className="h-3 w-3" aria-hidden="true" />
          {children}
        </button>
      )
    }
    if (timestamps?.kind === 'link') {
      return <Link href={`/lessons/${timestamps.lessonSlug}?t=${seconds}`} className="tabular-nums">{children}</Link>
    }
    return <>{children}</>
  }
  const external = typeof href === 'string' && /^https?:\/\//i.test(href)
  // Ссылки пишет ученик: поисковикам они не рекомендация, а открытая страница не получает window.opener.
  return (
    <a {...props} href={href} rel={external ? 'noopener noreferrer nofollow ugc' : 'nofollow ugc'} {...(external ? { target: '_blank' } : {})}>
      {children}
    </a>
  )
}

/** Заголовок в переписке - просто выделенная строка, а не крупный шрифт посреди ветки. */
function Heading({ children }: ComponentProps<'h1'> & ExtraProps) {
  return <p className="font-semibold">{children}</p>
}

const components: Components = {
  pre: MessagePre,
  a: MessageLink,
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  // Картинку по чужому адресу не загружаем: она сообщила бы стороннему сайту, кто открыл ветку.
  img: ({ src, alt }) => (typeof src === 'string' && src
    ? <a href={src} target="_blank" rel="noopener noreferrer nofollow ugc">{alt || 'изображение'}</a>
    : <>{alt}</>),
  table: ({ node: _node, ...props }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table {...props} />
    </div>
  ),
}

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeTimestamps]

const PROSE = [
  'prose prose-sm dark:prose-invert max-w-none text-foreground [overflow-wrap:anywhere]',
  '[&>:first-child]:mt-0 [&>:last-child]:mb-0 [&>.not-prose]:my-3',
  // Переносы строк ученика сохраняются, как в обычном тексте.
  'prose-p:my-1.5 prose-p:whitespace-pre-wrap prose-p:text-foreground prose-li:my-0 prose-ul:my-1.5 prose-ol:my-1.5',
  'prose-a:text-primary prose-a:underline-offset-2 prose-strong:text-foreground',
  'prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none',
  'prose-blockquote:my-2 prose-blockquote:border-l-primary prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-muted-foreground [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none',
].join(' ')

/**
 * Текст вопроса или ответа: Markdown с подсветкой кода и таймкодами видео.
 * Сырой HTML не исполняется: rehype-raw намеренно не подключён, текст пишут ученики.
 */
export function MessageContent({ content, timestamps = null, className }: { content: string; timestamps?: TimestampTarget; className?: string }) {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null)
  const state = useMemo(() => ({ highlighter, timestamps }), [highlighter, timestamps])
  const languageKey = useMemo(
    () => [...new Set([...content.matchAll(/^ {0,3}(?:```|~~~)([\w-]+)/gm)].map((match) => markdownLanguage(match[1].toLowerCase())))].sort().join(','),
    [content],
  )
  const rendered = useMemo(() => (
    <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={components}>
      {content}
    </Markdown>
  ), [content])

  useEffect(() => {
    if (!languageKey) return
    let cancelled = false
    getMarkdownHighlighter(languageKey.split(',')).then(
      (instance) => { if (!cancelled) setHighlighter(instance) },
      (error: unknown) => {
        // Без подсветки код остаётся читаемым обычным блоком.
        console.warn('Не удалось загрузить подсветку кода в сообщении', error)
      },
    )
    return () => { cancelled = true }
  }, [languageKey])

  return (
    <MessageContext.Provider value={state}>
      <div className={cn(PROSE, className)}>{rendered}</div>
    </MessageContext.Provider>
  )
}
