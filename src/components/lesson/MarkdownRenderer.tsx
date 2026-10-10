'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useEffect, useState, type ComponentPropsWithoutRef } from 'react'
import type { HighlighterCore } from 'shiki/core'
import { getMarkdownHighlighter, markdownLanguage } from '@/lib/markdown-highlighter'

type Props = {
  content: string
}

/**
 * Рендерит Markdown-контент с подсветкой кода через Shiki.
 * Shiki загружается лениво для оптимизации bundle size.
 */
export function MarkdownRenderer({ content }: Props) {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null)
  const requested = [...content.matchAll(/^(?:```|~~~)([\w-]+)/gm)].map((match) => match[1])
  const languageKey = [...new Set(requested)].sort().join(',')

  useEffect(() => {
    if (!languageKey) return
    let cancelled = false
    void getMarkdownHighlighter(languageKey.split(',')).then((instance) => {
      if (!cancelled) setHighlighter(instance)
    }).catch(() => {
      // Исходный код остаётся читаемым при ошибке загрузки подсветки.
      if (!cancelled) setHighlighter(null)
    })
    return () => { cancelled = true }
  }, [languageKey])

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-a:text-primary prose-strong:text-foreground prose-code:text-primary prose-code:before:content-none prose-code:after:content-none prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-pre:rounded-xl">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code(props: ComponentPropsWithoutRef<'code'>) {
            const { children, className, ...rest } = props
            const match = /language-(\w+)/.exec(className ?? '')
            const lang = match ? markdownLanguage(match[1]) : undefined

            if (lang && highlighter?.getLoadedLanguages().includes(lang) && String(children).length <= 20_000) {
              const html = highlighter.codeToHtml(String(children).replace(/\n$/, ''), {
                lang,
                themes: { dark: 'github-dark', light: 'github-light' },
              })
              return <span dangerouslySetInnerHTML={{ __html: html }} />
            }

            if (lang) {
              return (
                <code className={className} {...rest}>
                  {children}
                </code>
              )
            }

            // Inline code
            return (
              <code
                className="rounded bg-secondary px-1.5 py-0.5 text-sm font-mono"
                {...rest}
              >
                {children}
              </code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
