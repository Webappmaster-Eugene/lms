'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useEffect, useState, type ComponentPropsWithoutRef } from 'react'

type Props = {
  content: string
}

/**
 * Рендерит Markdown-контент с подсветкой кода через Shiki.
 * Shiki загружается лениво для оптимизации bundle size.
 */
export function MarkdownRenderer({ content }: Props) {
  const [highlighter, setHighlighter] = useState<Awaited<
    ReturnType<typeof import('shiki')['createHighlighter']>
  > | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadHighlighter() {
      const { createHighlighter } = await import('shiki')
      const hl = await createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: ['javascript', 'typescript', 'jsx', 'tsx', 'html', 'css', 'json', 'bash', 'sql', 'yaml', 'markdown'],
      })
      if (!cancelled) setHighlighter(hl)
    }

    loadHighlighter()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-a:text-primary prose-strong:text-foreground prose-code:text-primary prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-pre:rounded-xl">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code(props: ComponentPropsWithoutRef<'code'>) {
            const { children, className, ...rest } = props
            const match = /language-(\w+)/.exec(className ?? '')
            const lang = match?.[1]

            if (lang && highlighter) {
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
      />
    </div>
  )
}
