import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { HighlighterCore } from 'shiki/core'

import { guideMarkdownHeadings, markdownCodeLanguages } from '@/lib/guide-markdown'
import { getMarkdownHighlighter, markdownLanguage } from '@/lib/markdown-highlighter'
import { logger } from '@/lib/telemetry'

/** Длиннее блок кода подсвечивать нет смысла: в инструкции его копируют, а не читают. */
const MAX_HIGHLIGHTED = 20_000

type HastNode = { type: string; tagName?: string; value?: string; properties?: { className?: unknown }; children?: HastNode[] }

function hastText(node: HastNode): string {
  return node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(hastText).join('')
}

function codeLanguage(className: unknown): string | null {
  const classes = Array.isArray(className) ? className.map(String) : typeof className === 'string' ? className.split(/\s+/) : []
  const language = classes.find((name) => name.startsWith('language-'))
  return language ? markdownLanguage(language.slice('language-'.length).toLowerCase()) : null
}

async function loadHighlighter(languages: string[]): Promise<HighlighterCore | null> {
  if (languages.length === 0) return null
  try {
    return await getMarkdownHighlighter(languages)
  } catch (error) {
    // Без подсветки код остаётся читаемым обычным блоком.
    logger.error('Не удалось загрузить подсветку кода гайда', error)
    return null
  }
}

const PROSE = [
  'prose prose-sm dark:prose-invert max-w-none break-words sm:prose-base',
  'prose-headings:scroll-mt-20 prose-headings:text-foreground prose-a:text-primary prose-a:underline-offset-2 prose-strong:text-foreground',
  'prose-li:marker:text-muted-foreground prose-hr:border-border',
  // Код в строке — плашкой, как в уроках: typography дорисовывает обратные кавычки.
  'prose-code:rounded prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:bg-secondary prose-pre:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  // Цитата — врезка с советом или предупреждением, а не курсивная цитата в кавычках.
  'prose-blockquote:rounded-r-lg prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:pr-4 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-foreground [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none',
  'prose-table:my-0 prose-thead:border-border prose-tr:border-border prose-th:bg-muted/60 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2',
  '[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0 [&_.task-list-item_input]:mr-2 [&_.task-list-item_input]:accent-primary',
].join(' ')

/** Текст гайда из Markdown. Сырой HTML не исполняется: rehype-raw здесь намеренно не подключён. */
export async function GuideMarkdown({ markdown }: { markdown: string }) {
  const anchors = new Map(guideMarkdownHeadings(markdown).map((heading) => [heading.offset, heading.id]))
  const highlighter = await loadHighlighter(markdownCodeLanguages(markdown))

  const components: Components = {
    h2: ({ node, children, ...props }) => {
      const id = anchors.get(node?.position?.start.offset ?? -1)
      return <h2 {...props} id={id}>{children}</h2>
    },
    a: ({ node: _node, href, children, ...props }) => {
      const external = typeof href === 'string' && /^https?:\/\//.test(href)
      return <a {...props} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
    },
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
  }

  return (
    <div className={PROSE}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  )
}
