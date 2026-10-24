import Markdown, { type Components } from 'react-markdown'
import { Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert } from 'lucide-react'
import remarkGfm from 'remark-gfm'
import type { HighlighterCore } from 'shiki/core'

import { CopyCodeButton } from '@/components/guides/CopyCodeButton'
import { GUIDE_CALLOUTS, guideMarkdownHeadings, isGuideCalloutType, remarkGuideCallouts } from '@/lib/guide-markdown'
import { markdownLanguage } from '@/lib/markdown-highlighter'

import '@/app/fonts.css'
import './guide-prose.css'

const ICONS = { note: Info, tip: Lightbulb, important: MessageSquareWarning, warning: TriangleAlert, caution: OctagonAlert }

/** Одинаковые разбор, HTML и оформление в CMS и на странице ученика. */
export function GuideMarkdownContent({ markdown, highlighter }: { markdown: string; highlighter?: HighlighterCore | null }) {
  const anchors = new Map(guideMarkdownHeadings(markdown).map((heading) => [heading.offset, heading.id]))
  const shared: Components = {
    aside: ({ node, children, ...props }) => {
      const type = node?.properties?.dataCallout
      if (!isGuideCalloutType(type)) return <aside {...props}>{children}</aside>
      const title = node?.properties?.dataTitle
      const Icon = ICONS[type]
      return (
        <aside data-callout={type} className={`guide-prose__callout guide-prose__callout--${type}`}>
          <p className="guide-prose__callout-title"><Icon aria-hidden="true" />{typeof title === 'string' && title ? title : GUIDE_CALLOUTS[type]}</p>
          {children}
        </aside>
      )
    },
    h2: ({ node, children, ...props }) => <h2 {...props} id={anchors.get(node?.position?.start.offset ?? -1)}>{children}</h2>,
    a: ({ node: _node, href, children, ...props }) => (
      <a {...props} href={href} {...(href && /^https?:\/\//.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
    ),
    table: ({ node: _node, ...props }) => <div className="guide-prose__table"><table {...props} /></div>,
    img: ({ node: _node, src, alt, title }) => {
      if (typeof src !== 'string' || !src) return null
      return (
        <span className="guide-prose__figure">
          <a href={src} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- размеры картинки из Markdown неизвестны */}
            <img src={src} alt={alt ?? ''} title={title ?? undefined} loading="lazy" decoding="async" />
          </a>
          {title && <span>{title}</span>}
        </span>
      )
    },
    pre: ({ node, children, ...props }) => {
      const code = node?.children[0]
      const text = code?.type === 'element' && code.tagName === 'code'
        ? code.children.map((child) => child.type === 'text' ? child.value : '').join('').replace(/\n$/, '')
        : ''
      const classes = code?.type === 'element' ? code.properties.className : null
      const className = Array.isArray(classes) ? classes.find((name) => typeof name === 'string' && name.startsWith('language-')) : null
      const language = typeof className === 'string' ? markdownLanguage(className.slice(9).toLowerCase()) : null
      if (highlighter && language && highlighter.getLoadedLanguages().includes(language) && text.length <= 20_000) {
        const html = highlighter.codeToHtml(text, { lang: language, themes: { light: 'github-light', dark: 'github-dark' } })
        return <div className="guide-prose__code"><div dangerouslySetInnerHTML={{ __html: html }} /><CopyCodeButton code={text} /></div>
      }
      return <div className="guide-prose__code"><pre {...props}>{children}</pre>{text && <CopyCodeButton code={text} />}</div>
    },
  }
  return <div className="guide-prose"><Markdown remarkPlugins={[remarkGfm, remarkGuideCallouts]} components={shared}>{markdown}</Markdown></div>
}
