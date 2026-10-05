'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'

import { buttonClass } from '@/components/content-management/form-utils'

type Props = {
  saving: boolean
  dirty: boolean
  published: boolean
  error: string
  success: string
  onBack?: () => void
  previewHref?: string
  create?: boolean
  backLabel?: string
}

export function EditorActions({ saving, dirty, published, error, success, onBack, previewHref, create, backLabel = 'Назад к программе' }: Props) {
  return <div className="space-y-3 border-t border-border pt-5">
    {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {success && <p role="status" className="text-sm text-success">{success}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={saving} className={`${buttonClass} gap-2 border-primary bg-primary text-primary-foreground`}>
        {saving && <Loader2 aria-hidden="true" size={16} className="animate-spin" />}
        {saving ? 'Сохраняем…' : published ? 'Сохранить и опубликовать' : create ? 'Создать черновик' : 'Сохранить черновик'}
      </button>
      {onBack && <button type="button" disabled={saving} onClick={onBack} className={buttonClass}>{backLabel}</button>}
      {previewHref && <Link href={previewHref} className={`${buttonClass} hover:bg-muted`}>Открыть сохранённую версию</Link>}
      <span className="text-sm text-muted-foreground">{dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</span>
    </div>
  </div>
}
