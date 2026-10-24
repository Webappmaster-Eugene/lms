'use client'

import { useEffect, useState } from 'react'
import type { HighlighterCore } from 'shiki/core'

import { GuideMarkdownContent } from '@/components/guides/GuideMarkdownContent'
import { markdownCodeLanguages } from '@/lib/guide-markdown'
import { getMarkdownHighlighter } from '@/lib/markdown-highlighter'

export function GuideMarkdownPreview({ markdown }: { markdown: string }) {
  const [loaded, setLoaded] = useState<{ highlighter: HighlighterCore } | null>(null)
  const languages = markdownCodeLanguages(markdown).sort().join(',')
  useEffect(() => {
    if (!languages) return
    let cancelled = false
    getMarkdownHighlighter(languages.split(',')).then((highlighter) => {
      if (!cancelled) setLoaded({ highlighter })
    }).catch((error: unknown) => console.error('Не удалось загрузить подсветку кода предпросмотра', error))
    return () => { cancelled = true }
  }, [languages])
  return <GuideMarkdownContent markdown={markdown} highlighter={loaded?.highlighter} />
}
