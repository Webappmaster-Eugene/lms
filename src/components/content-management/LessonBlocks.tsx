'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'

import { contentKey } from '@/lib/content-management/keys'

import type { Lesson } from '@/payload-types'
import { emptyRichText, RichTextEditor } from '@/components/content-management/RichTextEditor'
import { MediaPicker } from '@/components/content-management/MediaPicker'

type Blocks = NonNullable<Lesson['content']>
type Block = Blocks[number]
const names: Record<Block['blockType'], string> = { text: 'Текст', video: 'Видео', image: 'Изображение', link: 'Ссылка', miro: 'Miro-доска', file: 'Файл' }
const fieldClass = 'mt-1 min-h-[44px] w-full rounded border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'
const buttonClass = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'

function freshBlock(type: Block['blockType']): Block {
  const id = contentKey()
  switch (type) {
    case 'text': return { id, blockType: type, content: emptyRichText() }
    case 'video': return { id, blockType: type, title: '', videoUrl: '', displayMode: 'embed' }
    case 'image': return { id, blockType: type, image: 0 }
    case 'link': return { id, blockType: type, title: '', url: '', platform: 'other' }
    case 'miro': return { id, blockType: type, title: '', embedUrl: '', height: 600 }
    case 'file': return { id, blockType: type, title: '', file: 0 }
  }
}

function Input({ label, value, onChange, disabled, type = 'text', min, max, required = false }: {
  label: string
  value: string | number | null | undefined
  onChange: (value: string) => void
  disabled: boolean
  type?: 'text' | 'url' | 'number'
  min?: number
  max?: number
  required?: boolean
}) {
  return <label className="block text-sm font-medium">{label}{required && ' *'}<input type={type} value={value ?? ''} disabled={disabled} min={min} max={max} required={required} className={fieldClass} onChange={(event) => onChange(event.target.value)} /></label>
}

function Description({ value, disabled, onChange }: { value: string | null | undefined; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium">Описание<textarea className={fieldClass} rows={3} value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>
}

export function LessonBlocks({ value, onChange, disabled = false }: { value: Blocks; onChange: (value: Blocks) => void; disabled?: boolean }) {
  const [removing, setRemoving] = useState<string | number | null>(null)
  const update = (index: number, patch: Partial<Block>) => onChange(value.map((block, current) => current === index ? { ...block, ...patch } as Block : block))
  function move(index: number, delta: -1 | 1) {
    const next = [...value]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const current = next[index]
    next[index] = next[target]
    next[target] = current
    onChange(next)
  }
  return <section className="space-y-4" aria-labelledby="lesson-materials-label">
    <div><h2 id="lesson-materials-label" className="text-xl font-semibold">Материалы урока</h2><p className="mt-1 text-sm text-muted-foreground">Добавляйте материалы в том порядке, в котором ученик будет их изучать.</p></div>
    {!value.length && <p className="rounded border border-dashed p-6 text-sm text-muted-foreground">В уроке пока нет материалов. Начните с текста, видео или файла.</p>}
    {value.map((block, index) => {
      const key = block.id ?? index
      const id = `lesson-block-${key}`
      return <article key={key} className="space-y-4 rounded border bg-card p-4 sm:p-5" aria-label={`${index + 1}. ${names[block.blockType]}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">{index + 1}. {names[block.blockType]}</h3>
          <div className="flex gap-2">
            <button type="button" disabled={disabled || index === 0} className={buttonClass} aria-label={`Поднять материал ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" size={16} /></button>
            <button type="button" disabled={disabled || index === value.length - 1} className={buttonClass} aria-label={`Опустить материал ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" size={16} /></button>
            <button type="button" disabled={disabled} className={`${buttonClass} text-destructive`} aria-label={`Удалить материал ${index + 1}`} onClick={() => setRemoving(key)}><Trash2 aria-hidden="true" size={16} /></button>
          </div>
        </div>
        {removing === key && <div className="flex flex-wrap items-center gap-2 rounded bg-destructive/10 p-3 text-sm"><p>Удалить этот материал из урока?</p><button type="button" className={`${buttonClass} text-destructive`} disabled={disabled} onClick={() => { onChange(value.filter((_, current) => current !== index)); setRemoving(null) }}>Да, удалить материал</button><button type="button" className={buttonClass} onClick={() => setRemoving(null)}>Оставить материал</button></div>}
        <Input label="Название блока для редактора" value={block.blockName} disabled={disabled} onChange={(blockName) => update(index, { blockName })} />
        {block.blockType === 'text' && <RichTextEditor id={`${id}-text`} label="Текст урока" value={block.content} disabled={disabled} onChange={(content) => update(index, { content })} />}
        {block.blockType === 'video' && <>
          <Input label="Название видео" value={block.title} disabled={disabled} required onChange={(title) => update(index, { title })} />
          <Input label="Ссылка на видео" type="url" value={block.videoUrl} disabled={disabled} required onChange={(videoUrl) => update(index, { videoUrl })} />
          <label className="block text-sm font-medium">Как показывать видео<select value={block.displayMode} disabled={disabled} className={fieldClass} onChange={(event) => update(index, { displayMode: event.target.value as 'embed' | 'link' })}><option value="embed">Плеер внутри урока</option><option value="link">Ссылка в новой вкладке</option></select></label>
          <Input label="Длительность видео, минуты" type="number" min={0} value={block.durationMinutes} disabled={disabled} onChange={(duration) => update(index, { durationMinutes: duration === '' ? null : Number(duration) })} />
          <Description value={block.description} disabled={disabled} onChange={(description) => update(index, { description })} />
        </>}
        {block.blockType === 'image' && <>
          <MediaPicker id={`${id}-image`} label="Изображение" imageOnly value={typeof block.image === 'number' ? block.image : block.image.id} disabled={disabled} onChange={(image) => update(index, { image: image ?? 0 })} />
          <Input label="Подпись под изображением" value={block.caption} disabled={disabled} onChange={(caption) => update(index, { caption })} />
          <Input label="Описание изображения для доступности" value={block.altText} disabled={disabled} onChange={(altText) => update(index, { altText })} />
        </>}
        {block.blockType === 'link' && <>
          <Input label="Название ссылки" value={block.title} disabled={disabled} required onChange={(title) => update(index, { title })} />
          <Input label="Адрес ссылки" value={block.url} disabled={disabled} required onChange={(url) => update(index, { url })} />
          <label className="block text-sm font-medium">Платформа<select value={block.platform ?? 'other'} disabled={disabled} className={fieldClass} onChange={(event) => update(index, { platform: event.target.value as 'boosty' | 'telegram' | 'youtube' | 'github' | 'other' })}><option value="other">Другое</option><option value="boosty">Boosty</option><option value="telegram">Telegram</option><option value="youtube">YouTube</option><option value="github">GitHub</option></select></label>
          <Description value={block.description} disabled={disabled} onChange={(description) => update(index, { description })} />
        </>}
        {block.blockType === 'miro' && <>
          <Input label="Название доски" value={block.title} disabled={disabled} required onChange={(title) => update(index, { title })} />
          <Input label="Ссылка для встраивания Miro" value={block.embedUrl} type="url" disabled={disabled} required onChange={(embedUrl) => update(index, { embedUrl })} />
          <p className="text-sm text-muted-foreground">В Miro выберите «Поделиться» → «Встроить» и скопируйте адрес https://miro.com/app/embed/… или https://miro.com/app/live-embed/…</p>
          <Input label="Высота доски, пиксели" value={block.height} type="number" min={300} max={1200} disabled={disabled} onChange={(height) => update(index, { height: height === '' ? null : Number(height) })} />
        </>}
        {block.blockType === 'file' && <>
          <Input label="Название файла" value={block.title} disabled={disabled} required onChange={(title) => update(index, { title })} />
          <MediaPicker id={`${id}-file`} label="Файл для скачивания" value={typeof block.file === 'number' ? block.file : block.file.id} disabled={disabled} onChange={(file) => update(index, { file: file ?? 0 })} />
          <Description value={block.description} disabled={disabled} onChange={(description) => update(index, { description })} />
        </>}
      </article>
    })}
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Добавить материал"><p className="mr-1 text-sm font-medium">Добавить материал:</p>{(Object.keys(names) as Block['blockType'][]).map((type) => <button key={type} type="button" className={buttonClass} disabled={disabled} onClick={() => onChange([...value, freshBlock(type)])}>{names[type]}</button>)}</div>
  </section>
}
