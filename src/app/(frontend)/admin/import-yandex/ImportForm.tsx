'use client'

import { useState } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

type Course = {
  id: string
  title: string
}

type ImportFormProps = {
  courses: Course[]
}

type ImportResult = {
  sectionsCreated: number
  lessonsCreated: number
  errors: string[]
  courseName?: string
}

export function ImportForm({ courses }: ImportFormProps) {
  const [courseId, setCourseId] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!courseId || !publicUrl.trim()) {
      setError('Выберите курс и укажите ссылку')
      return
    }

    setIsImporting(true)

    try {
      const res = await fetch('/api/yandex-disk/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ courseId, publicUrl: publicUrl.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Ошибка импорта')
        if (data.errors?.length) {
          setResult({ sectionsCreated: 0, lessonsCreated: 0, errors: data.errors })
        }
        return
      }

      setResult(data)
    } catch {
      setError('Ошибка сети. Попробуйте позже.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleImport} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <label htmlFor="import-course" className="block text-sm font-medium text-foreground mb-1.5">
            Курс
          </label>
          <select
            id="import-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors"
          >
            <option value="">Выберите курс</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="import-url" className="block text-sm font-medium text-foreground mb-1.5">
            Публичная ссылка на папку Яндекс.Диска
          </label>
          <input
            id="import-url"
            type="url"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://disk.yandex.ru/d/..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isImporting || !courseId || !publicUrl.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isImporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Импортируется...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Импортировать
            </>
          )}
        </button>
      </form>

      {/* Results */}
      {result && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          {(result.sectionsCreated > 0 || result.lessonsCreated > 0) && (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                Импорт завершён{result.courseName ? ` для курса "${result.courseName}"` : ''}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.sectionsCreated}</p>
              <p className="text-xs text-muted-foreground">Секций создано</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.lessonsCreated}</p>
              <p className="text-xs text-muted-foreground">Уроков создано</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-warning mb-2">
                Предупреждения ({result.errors.length}):
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.errors.map((err, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5 text-warning" />
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
