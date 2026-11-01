'use client'

import { useEffect, useId, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { CodeBlock } from './CodeBlock'
import { MarkdownImage } from './MarkdownImage'

type Mermaid = typeof import('mermaid').default

let loader: Promise<Mermaid> | undefined
// Рендер mermaid держит общее состояние: две схемы, нарисованные одновременно, мешают друг другу.
let queue: Promise<unknown> = Promise.resolve()

function loadMermaid(): Promise<Mermaid> {
  loader ??= import('mermaid').then(({ default: mermaid }) => {
    // Без HTML-подписей SVG рисуется и внутри <img>: просмотр схем показывает её картинкой.
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', htmlLabels: false, flowchart: { htmlLabels: false } })
    return mermaid
  }).catch((error: unknown) => {
    loader = undefined
    throw error
  })
  return loader
}

function renderMermaid(id: string, code: string): Promise<string> {
  const job = queue.then(async () => {
    const mermaid = await loadMermaid()
    await mermaid.parse(code)
    const { svg } = await mermaid.render(id, code)
    return svg
  })
  queue = job.catch(() => undefined)
  return job
}

function svgDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

/** Подпись для просмотра схемы: accTitle из самой схемы, иначе общее слово. */
function mermaidTitle(code: string): string {
  return code.match(/^\s*accTitle\s*:\s*(.+)$/m)?.[1].trim() || 'Схема'
}

/**
 * Схема из блока ```mermaid. Рисуется в браузере, библиотека грузится только на страницах
 * со схемами. Если схема не разбирается, ученик видит её текст, а не пустое место.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`
  // Результат помнит, для какого текста он получен: новая схема сразу показывается как загружающаяся.
  const [result, setResult] = useState<{ code: string; src: string | null } | null>(null)
  const state = result?.code === code ? result : null

  useEffect(() => {
    let cancelled = false
    renderMermaid(id, code).then(
      (svg) => { if (!cancelled) setResult({ code, src: svgDataUri(svg) }) },
      (error: unknown) => {
        console.warn('Не удалось нарисовать схему урока', error)
        if (!cancelled) setResult({ code, src: null })
      },
    )
    return () => { cancelled = true }
  }, [id, code])

  if (state?.src) return <MarkdownImage src={state.src} alt={mermaidTitle(code)} />
  if (state) {
    return (
      <div className="not-prose">
        <p className="text-sm text-muted-foreground">Схему не удалось нарисовать, ниже её текст.</p>
        <CodeBlock code={code} language="mermaid">
          <pre className="overflow-x-auto bg-secondary p-4 text-sm leading-relaxed text-foreground">{code}</pre>
        </CodeBlock>
      </div>
    )
  }
  return (
    <div role="status" className="not-prose my-6 flex min-h-32 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      Рисуем схему…
    </div>
  )
}
