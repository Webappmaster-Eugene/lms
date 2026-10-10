'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'

const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function AvatarField({ currentUrl, initials, file, removed, disabled, onChange }: {
  currentUrl: string | null
  initials: string
  file: File | null
  removed: boolean
  disabled: boolean
  onChange: (file: File | null, removed: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLImageElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    if (previewRef.current) previewRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const url = removed ? null : currentUrl

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {(file || url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={previewRef} src={file ? undefined : url ?? undefined} alt="Ваш аватар" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary" aria-label="Аватар без фотографии">{initials || '?'}</div>
      )}
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm font-medium hover:bg-accent focus-within:outline-2 focus-within:outline-ring ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            Изменить аватар
            <input ref={inputRef} type="file" accept={imageTypes.join(',')} disabled={disabled} aria-label="Изменить аватар" aria-describedby="avatar-help avatar-error" className="sr-only" onChange={(event) => {
              const selected = event.target.files?.[0]
              if (!selected) return
              if (!imageTypes.includes(selected.type) || selected.size > 2 * 1024 * 1024) {
                setError('Выберите PNG, JPG, WebP или GIF размером до 2 МБ.')
                onChange(null, removed)
                event.target.value = ''
                return
              }
              setError('')
              onChange(selected, false)
            }} />
          </label>
          {(file || (currentUrl && !removed)) && <button type="button" disabled={disabled} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" onClick={() => {
            onChange(null, true)
            setError('')
            if (inputRef.current) inputRef.current.value = ''
          }}><X className="h-4 w-4" aria-hidden="true" />Удалить аватар</button>}
        </div>
        <p id="avatar-help" className="text-xs text-muted-foreground">PNG, JPG, WebP или GIF до 2 МБ. Изменения применятся после сохранения.</p>
        {file && <p className="break-all text-xs text-muted-foreground">Выбран файл: {file.name}</p>}
        {removed && <p className="text-xs text-muted-foreground">Аватар будет удалён из профиля.</p>}
        <p id="avatar-error" role={error ? 'alert' : undefined} className="text-sm text-destructive">{error}</p>
      </div>
    </div>
  )
}
