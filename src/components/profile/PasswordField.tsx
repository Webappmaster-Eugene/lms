'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export const fieldClassName = 'mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-60'

export function PasswordField({ id, label, value, onChange, disabled, autoComplete, minLength, describedBy }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
  describedBy?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required minLength={minLength} maxLength={autoComplete === 'current-password' ? 1024 : 128} autoComplete={autoComplete} aria-describedby={describedBy} className={`${fieldClassName} pr-12`} />
        <button type="button" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${visible ? 'Скрыть' : 'Показать'}: ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}
