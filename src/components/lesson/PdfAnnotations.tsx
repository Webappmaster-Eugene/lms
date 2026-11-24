'use client'

import { useRef, useState, type PointerEvent } from 'react'
import { Pencil, Type, Undo2, Redo2, Trash2 } from 'lucide-react'

export type AnnotationTool = 'pen' | 'text'
type Point = { x: number; y: number }
export type PdfMark = { kind: 'stroke'; points: Point[] } | { kind: 'text'; origin: Point; text: string }

const coordinateSize = 1000
const textLimit = 80
const toolClass = 'inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary/15 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-background'
const iconClass = 'h-4 w-4 shrink-0'
const toolLabel = 'hidden @min-[23rem]:inline'

export function AnnotationTools({ tool, toggle, canUndo, canRedo, canClear, undo, redo, clear }: {
  tool: AnnotationTool | null
  toggle: (next: AnnotationTool) => void
  canUndo: boolean
  canRedo: boolean
  canClear: boolean
  undo: () => void
  redo: () => void
  clear: () => void
}) {
  return <div role="group" aria-label="Пометки на слайде" className="flex flex-wrap items-center justify-center gap-2">
    <div className="flex gap-1">
      <button type="button" className={toolClass} aria-label="Карандаш" title="Карандаш" aria-pressed={tool === 'pen'} onClick={() => toggle('pen')}>
        <Pencil className={iconClass} aria-hidden="true" /><span className={toolLabel}>Карандаш</span>
      </button>
      <button type="button" className={toolClass} aria-label="Текст" title="Текст" aria-pressed={tool === 'text'} onClick={() => toggle('text')}>
        <Type className={iconClass} aria-hidden="true" /><span className={toolLabel}>Текст</span>
      </button>
    </div>
    <div className="flex gap-1">
      <button type="button" className={toolClass} aria-label="Отменить" title="Отменить (Ctrl+Z / Cmd+Z)"
        aria-keyshortcuts="Control+Z Meta+Z" aria-disabled={!canUndo} onClick={() => { if (canUndo) undo() }}>
        <Undo2 className={iconClass} aria-hidden="true" />
      </button>
      <button type="button" className={toolClass} aria-label="Вернуть" title="Вернуть (Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z)"
        aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z" aria-disabled={!canRedo} onClick={() => { if (canRedo) redo() }}>
        <Redo2 className={iconClass} aria-hidden="true" />
      </button>
    </div>
    <button type="button" className={toolClass} aria-label="Очистить слайд" title="Очистить слайд"
      aria-disabled={!canClear} onClick={() => { if (canClear) clear() }}>
      <Trash2 className={iconClass} aria-hidden="true" />
    </button>
  </div>
}

function coordinates(event: PointerEvent<SVGSVGElement>): Point {
  const area = event.currentTarget.getBoundingClientRect()
  const limit = (value: number) => Math.min(coordinateSize, Math.max(0, Math.round(value * coordinateSize)))
  return { x: limit((event.clientX - area.left) / area.width), y: limit((event.clientY - area.top) / area.height) }
}

function position(point: Point) {
  return {
    left: `${point.x / 10}%`, top: `${point.y / 10}%`,
    transform: `translate(${point.x > 650 ? '-100%' : '0'}, ${point.y > 780 ? '-100%' : '0'})`,
  }
}

function focusInput(input: HTMLInputElement | null) { input?.focus() }

function Stroke({ points }: { points: Point[] }) {
  const vertices = (points.length === 1 ? [points[0], { x: points[0].x + 0.1, y: points[0].y }] : points)
    .map(({ x, y }) => `${x},${y}`).join(' ')
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={vertices} stroke="#10241E" strokeWidth={6} vectorEffect="non-scaling-stroke" />
    <polyline points={vertices} stroke="#FFD23F" strokeWidth={3} vectorEffect="non-scaling-stroke" />
  </g>
}

export function PdfAnnotations({ tool, marks, add }: {
  tool: AnnotationTool | null
  marks: PdfMark[]
  add: (mark: PdfMark) => void
}) {
  const surface = useRef<SVGSVGElement>(null)
  const drawing = useRef<{ id: number; points: Point[] } | null>(null)
  const [preview, setPreview] = useState<Point[] | null>(null)
  const [origin, setOrigin] = useState<Point | null>(null)

  function start(event: PointerEvent<SVGSVGElement>) {
    if (!tool || event.button !== 0 || !event.isPrimary || drawing.current) return
    event.preventDefault()
    const point = coordinates(event)
    if (tool === 'text') {
      setOrigin(point)
      return
    }
    event.currentTarget.closest<HTMLElement>('[data-slide-deck]')?.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = { id: event.pointerId, points: [point] }
    setPreview([point])
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const stroke = drawing.current
    if (!stroke || stroke.id !== event.pointerId) return
    const point = coordinates(event)
    const last = stroke.points.at(-1)
    if (last && Math.abs(last.x - point.x) + Math.abs(last.y - point.y) < 2) return
    stroke.points.push(point)
    setPreview([...stroke.points])
  }

  function end(event: PointerEvent<SVGSVGElement>, commit: boolean) {
    const stroke = drawing.current
    if (!stroke || stroke.id !== event.pointerId) return
    drawing.current = null
    setPreview(null)
    if (commit) add({ kind: 'stroke', points: [...stroke.points, coordinates(event)] })
  }

  function closeEditor() {
    setOrigin(null)
    surface.current?.focus()
  }

  return <>
    <svg
      ref={surface}
      className={`absolute inset-0 h-full w-full ${tool && !origin ? 'pointer-events-auto touch-none cursor-crosshair' : 'pointer-events-none'}`}
      viewBox={`0 0 ${coordinateSize} ${coordinateSize}`}
      preserveAspectRatio="none"
      aria-hidden={tool !== 'text' || Boolean(origin)}
      aria-label={tool === 'text' && !origin ? 'Добавить подпись в центре слайда' : undefined}
      role={tool === 'text' && !origin ? 'button' : undefined}
      tabIndex={tool === 'text' ? origin ? -1 : 0 : undefined}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={(event) => end(event, true)}
      onPointerCancel={(event) => end(event, false)}
      onLostPointerCapture={(event) => end(event, false)}
      onKeyDown={(event) => {
        if (tool === 'text' && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          setOrigin({ x: 500, y: 500 })
        }
      }}
    >
      <rect width={coordinateSize} height={coordinateSize} fill="transparent" />
      {marks.map((mark, index) => mark.kind === 'stroke' && <Stroke key={index} points={mark.points} />)}
      {preview && <Stroke points={preview} />}
    </svg>
    {marks.map((mark, index) => mark.kind === 'text' && <span key={index} style={position(mark.origin)}
      className="pointer-events-none absolute max-w-[40%] whitespace-pre-wrap break-words rounded-sm bg-[#10241e] px-1.5 py-0.5 text-[clamp(0.75rem,2.9cqw,2.75rem)] leading-tight text-white">{mark.text}</span>)}
    {tool === 'text' && origin && <form
      className="pointer-events-auto absolute z-10 flex w-max max-w-full flex-wrap gap-1 rounded-md border border-border bg-card p-1 text-foreground shadow-sm"
      style={{ ...position(origin), left: `${Math.min(98, Math.max(2, origin.x / 10))}%` }}
      onSubmit={(event) => {
        event.preventDefault()
        const text = String(new FormData(event.currentTarget).get('annotation') ?? '').trim()
        if (!text) return
        add({ kind: 'text', origin, text })
        closeEditor()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        closeEditor()
      }}
    >
      <input ref={focusInput} name="annotation" aria-label="Текст подписи" placeholder="Подпись" maxLength={textLimit} required
        className="min-h-9 w-[min(12rem,40cqw)] rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
      <button type="submit" className="min-h-9 rounded-md bg-primary px-2 text-sm text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">Добавить</button>
    </form>}
  </>
}
