'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Button, useField } from '@payloadcms/ui'

import { parseGuideFile } from '@/lib/guide-file'

/** Гайд больше мегабайта — почти наверняка не тот файл. */
const MAX_FILE_BYTES = 1_000_000

/** Категория — связь: имя из шапки переводим в id по справочнику, как это делает сервер. */
async function findCategory(name: string): Promise<number> {
  const response = await fetch('/api/guide-categories?limit=1000&depth=0', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('не удалось загрузить список категорий')
  const all = ((await response.json())?.docs ?? []) as { id: number; slug: string; title: string }[]
  const text = name.trim().toLowerCase()
  const match = all.find((item) => item.slug.toLowerCase() === text || (item.title ?? '').trim().toLowerCase() === text)
  if (!match) throw new Error(`категории «${name.trim()}» нет - создайте её и выберите вручную`)
  return match.id
}

/** Кнопка в CMS: `.md`-файл гайда раскладывается по полям формы, текст — в поле Markdown. */
export function GuideMarkdownUpload() {
  const markdown = useField<string>({ path: 'markdown' })
  const title = useField<string>({ path: 'title' })
  const summary = useField<string>({ path: 'summary' })
  const slug = useField<string>({ path: 'slug' })
  const order = useField<number>({ path: 'order' })
  const published = useField<boolean>({ path: 'isPublished' })
  const category = useField<number | null>({ path: 'category' })
  const reviewedAt = useField<string | null>({ path: 'reviewedAt' })
  const reviewBy = useField<string | null>({ path: 'reviewBy' })
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null)

  async function load(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Тот же файл можно выбрать повторно, например после правки на диске.
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('файл больше 1 МБ')
      const { fields, markdown: body, problems } = parseGuideFile(await file.text())
      if (problems.length) throw new Error(`в шапке ${problems.join('; ')}`)
      if (!body.trim()) throw new Error('в файле нет текста гайда')
      // Поля пишутся только после всех проверок: ошибка не должна оставлять форму заполненной наполовину.
      const categoryId = fields.category ? await findCategory(fields.category) : undefined
      markdown.setValue(body)
      const filled = ['текст']
      if (fields.title) { title.setValue(fields.title); filled.push('название') }
      if (fields.summary) { summary.setValue(fields.summary); filled.push('описание') }
      if (fields.slug) { slug.setValue(fields.slug); filled.push('slug') }
      if (fields.order !== undefined) { order.setValue(fields.order); filled.push('порядок') }
      if (fields.published !== undefined) { published.setValue(fields.published); filled.push('публикация') }
      if (categoryId !== undefined) { category.setValue(categoryId); filled.push('категория') }
      if (fields.reviewedAt) {
        reviewedAt.setValue(fields.reviewedAt)
        // Срок прошлой проверки к новой не относится; пустой пересчитает сервер.
        reviewBy.setValue(fields.reviewBy ?? null)
        filled.push('дата проверки')
      } else if (fields.reviewBy) { reviewBy.setValue(fields.reviewBy); filled.push('срок пересмотра') }
      setStatus({ error: false, text: `«${file.name}»: заполнены ${filled.join(', ')}. Проверьте и сохраните гайд.` })
    } catch (error) {
      console.error('Не удалось прочитать .md-файл гайда', error)
      setStatus({ error: true, text: `Не удалось прочитать «${file.name}»: ${error instanceof Error ? error.message : 'неизвестная ошибка'}` })
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base)' }}>
      <input ref={input} type="file" accept=".md,.markdown,text/markdown,text/plain" hidden onChange={load} />
      <Button type="button" buttonStyle="secondary" size="small" margin={false} onClick={() => input.current?.click()}>
        Загрузить .md
      </Button>
      <p className="field-description">
        Шапка файла между строками «---» (title, summary, slug, order, published, category, reviewed, review_by) заполнит поля, первая строка «# …» станет названием.
      </p>
      {status && (
        <p role="status" style={{ color: status.error ? 'var(--theme-error-500)' : 'var(--theme-success-500)' }}>
          {status.text}
        </p>
      )}
    </div>
  )
}
