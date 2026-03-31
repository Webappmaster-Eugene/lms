'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Save } from 'lucide-react'

export default function ProfileEditPage() {
  const router = useRouter()
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Загружаем текущие данные при первом рендере
  if (!initialized) {
    setInitialized(true)
    fetch('/api/users/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.bio) setBio(data.user.bio)
      })
      .catch(() => {})
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Если есть аватар — сначала загружаем медиа
      let avatarId: string | undefined
      if (avatarFile) {
        const formData = new FormData()
        formData.append('file', avatarFile)
        formData.append('alt', 'Аватар пользователя')

        const uploadRes = await fetch('/api/media', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })

        if (!uploadRes.ok) {
          throw new Error('Не удалось загрузить аватар')
        }

        const uploadData = await uploadRes.json()
        avatarId = uploadData.doc?.id
      }

      // Обновляем профиль
      const meRes = await fetch('/api/users/me', { credentials: 'include' })
      const meData = await meRes.json()
      const userId = meData.user?.id

      if (!userId) throw new Error('Не удалось определить пользователя')

      const updateData: Record<string, unknown> = { bio }
      if (avatarId) updateData.avatar = avatarId

      const updateRes = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updateData),
      })

      if (!updateRes.ok) {
        const data = await updateRes.json().catch(() => null)
        throw new Error(data?.errors?.[0]?.message ?? 'Ошибка сохранения')
      }

      setSuccess(true)
      setTimeout(() => router.push('/profile'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/profile"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к профилю
      </Link>

      <h1 className="text-2xl font-bold text-foreground">Редактирование профиля</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-success/50 bg-success/10 px-4 py-3 text-sm text-success">
            Профиль обновлён. Перенаправление...
          </div>
        )}

        {/* Аватар */}
        <div>
          <label className="block text-sm font-medium text-foreground">Аватар</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file && file.size > 5 * 1024 * 1024) {
                setError('Максимальный размер файла: 5 МБ')
                return
              }
              setAvatarFile(file ?? null)
            }}
            className="mt-1 block w-full rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-primary-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">PNG, JPG до 5 МБ</p>
        </div>

        {/* Био */}
        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-foreground">
            О себе
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            className="mt-1 block w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
            placeholder="Расскажите о себе..."
          />
          <p className="mt-1 text-xs text-muted-foreground">{bio.length}/500</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Сохранить
        </button>
      </form>
    </div>
  )
}
