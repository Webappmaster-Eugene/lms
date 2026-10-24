import { GuideMarkdownContent } from '@/components/guides/GuideMarkdownContent'
import { markdownCodeLanguages } from '@/lib/guide-markdown'
import { getMarkdownHighlighter } from '@/lib/markdown-highlighter'
import { logger } from '@/lib/telemetry'

/** Текст гайда из Markdown. Сырой HTML не исполняется: rehype-raw здесь намеренно не подключён. */
export async function GuideMarkdown({ markdown }: { markdown: string }) {
  const languages = markdownCodeLanguages(markdown)
  const highlighter = languages.length
    ? await getMarkdownHighlighter(languages).catch((error: unknown) => {
      logger.error('Не удалось загрузить подсветку кода гайда', error)
      return null
    })
    : null
  return <GuideMarkdownContent markdown={markdown} highlighter={highlighter} />
}
