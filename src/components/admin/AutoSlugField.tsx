'use client'

import { useEffect, useRef } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'

import { slugify } from '@/lib/slug'

/**
 * Поле slug, которое подставляется транслитом из названия вживую, пока его не правят вручную.
 * Существующий slug не трогаем: он уже в адресе гайда. Серверный generateSlug остаётся страховкой.
 */
export const AutoSlugField: TextFieldClientComponent = ({ field, path }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({ path })
  const title = useFormFields(([fields]) => (fields?.title?.value as string | undefined) ?? '')

  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  })
  const lastAuto = useRef<string | undefined>(undefined)

  useEffect(() => {
    const current = valueRef.current ?? ''
    // Руками введённый или уже существующий slug (не наш автослаг) не перезаписываем.
    if (current !== '' && current !== lastAuto.current) return
    const next = slugify(title)
    lastAuto.current = next
    if (next !== current) setValue(next)
  }, [title, setValue])

  const id = `field-${path}`
  const label = typeof field?.label === 'string' && field.label ? field.label : 'Slug'
  const description = field?.admin?.description
  return (
    <div className="field-type text">
      <label className="field-label" htmlFor={id}>
        {label}
        {field?.required && <span className="required">*</span>}
      </label>
      <div className="field-type__wrap">
        <input id={id} name={path} type="text" value={value ?? ''} onChange={(event) => setValue(event.target.value)} />
      </div>
      {showError && errorMessage && <div className="field-error">{errorMessage}</div>}
      {typeof description === 'string' && description && <div className="field-description">{description}</div>}
    </div>
  )
}
