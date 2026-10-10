'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'

import { normalizeTelegram, passwordPolicyError, type ProfileDTO } from '@/lib/profile'

import { AvatarField } from '@/components/profile/AvatarField'
import { AppearanceSettings } from '@/components/profile/AppearanceSettings'
import { PasswordField, fieldClassName } from '@/components/profile/PasswordField'

function requestErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof TypeError) return 'Не удалось соединиться с сервером. Проверьте интернет и повторите попытку.'
  return reason instanceof Error ? reason.message : fallback
}

async function responseData(response: Response): Promise<{ profile?: ProfileDTO; error?: string; ok?: boolean; doc?: { id?: number } }> {
  return response.json().catch(() => ({}))
}

export function ProfileSettings() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/profile', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await responseData(response)
        if (!response.ok || !data.profile) throw new Error(data.error ?? 'Не удалось загрузить профиль. Попробуйте ещё раз.')
        if (!controller.signal.aborted) setProfile(data.profile)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(requestErrorMessage(reason, 'Не удалось загрузить профиль.'))
      })
    return () => controller.abort()
  }, [attempt])

  if (error) return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p role="alert" className="text-sm text-destructive">{error}</p>
      <button type="button" onClick={() => { setError(''); setAttempt((value) => value + 1) }} className="mt-3 min-h-11 rounded-lg border border-input px-4 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">Повторить загрузку</button>
    </div>
  )
  if (!profile) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Загружаем профиль…</p>
  return <ProfileForm initialProfile={profile} />
}

function ProfileForm({ initialProfile }: { initialProfile: ProfileDTO }) {
  const router = useRouter()
  const [saved, setSaved] = useState(initialProfile)
  const [firstName, setFirstName] = useState(initialProfile.firstName)
  const [lastName, setLastName] = useState(initialProfile.lastName)
  const [email, setEmail] = useState(initialProfile.email)
  const [telegram, setTelegram] = useState(initialProfile.telegram ?? '')
  const [bio, setBio] = useState(initialProfile.bio ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const uploadedAvatar = useRef<{ file: File; id: number } | null>(null)
  const [emailPassword, setEmailPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState<'profile' | 'password' | null>(null)
  const lock = useRef(false)
  const mounted = useRef(true)
  const [profileError, setProfileError] = useState('')
  const [profileStatus, setProfileStatus] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordStatus, setPasswordStatus] = useState('')
  const emailChanged = email.trim().toLowerCase() !== saved.email.toLowerCase()
  const disabled = saving !== null

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setSaving('profile')
    setProfileError('')
    setProfileStatus('')
    try {
      const canonicalTelegram = normalizeTelegram(telegram)
      let avatar: number | null | undefined = removeAvatar ? null : undefined
      if (avatarFile) {
        if (uploadedAvatar.current?.file === avatarFile) avatar = uploadedAvatar.current.id
        else {
          const body = new FormData()
          body.append('file', avatarFile)
          body.append('_payload', JSON.stringify({ alt: 'Аватар пользователя' }))
          const response = await fetch('/api/media', { method: 'POST', credentials: 'include', body })
          const data = await responseData(response)
          if (!response.ok || typeof data.doc?.id !== 'number') throw new Error(data.error ?? 'Не удалось загрузить аватар. Попробуйте ещё раз.')
          avatar = data.doc.id
          uploadedAvatar.current = { file: avatarFile, id: avatar }
        }
      }
      const response = await fetch('/api/profile', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, telegram: canonicalTelegram, bio, ...(avatar !== undefined ? { avatar } : {}), ...(emailChanged ? { currentPassword: emailPassword } : {}) }),
      })
      const data = await responseData(response)
      if (!response.ok || !data.profile) throw new Error(data.error ?? 'Не удалось сохранить профиль. Попробуйте ещё раз.')
      if (!mounted.current) return
      setSaved(data.profile)
      setFirstName(data.profile.firstName)
      setLastName(data.profile.lastName)
      setEmail(data.profile.email)
      setTelegram(data.profile.telegram ?? '')
      setBio(data.profile.bio ?? '')
      setAvatarFile(null)
      setRemoveAvatar(false)
      uploadedAvatar.current = null
      setEmailPassword('')
      setProfileStatus(emailChanged ? 'Профиль сохранён. Для следующего входа используйте новый e-mail. На других устройствах потребуется войти заново.' : 'Профиль сохранён.')
      router.refresh()
    } catch (reason) {
      if (mounted.current) setProfileError(requestErrorMessage(reason, 'Не удалось сохранить профиль.'))
    } finally {
      lock.current = false
      if (mounted.current) setSaving(null)
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    setPasswordError('')
    setPasswordStatus('')
    if (newPassword !== confirmation) { setPasswordError('Новый пароль и подтверждение не совпадают.'); return }
    const policyError = passwordPolicyError(newPassword)
    if (policyError) {
      setPasswordError(policyError)
      return
    }
    lock.current = true
    setSaving('password')
    try {
      const response = await fetch('/api/profile/password', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await responseData(response)
      if (!response.ok || data.ok !== true) throw new Error(data.error ?? 'Не удалось изменить пароль. Попробуйте ещё раз.')
      if (!mounted.current) return
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setEmailPassword('')
      setPasswordStatus('Пароль изменён. На других устройствах потребуется войти заново.')
      router.refresh()
    } catch (reason) {
      if (mounted.current) setPasswordError(requestErrorMessage(reason, 'Не удалось изменить пароль.'))
    } finally {
      lock.current = false
      if (mounted.current) setSaving(null)
    }
  }

  return (
    <div className="space-y-6 text-foreground">
      <form aria-label="Личные данные" onSubmit={saveProfile} onChangeCapture={() => setProfileStatus('')} className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Личные данные</h2>
        <div className="mt-5 space-y-5">
          <AvatarField key={saved.avatar?.id ?? 'empty-avatar'} currentUrl={saved.avatar?.url ?? null} initials={`${firstName[0] ?? ''}${lastName[0] ?? ''}`} file={avatarFile} removed={removeAvatar} disabled={disabled} onChange={(file, removed) => { setAvatarFile(file); setRemoveAvatar(removed); setProfileStatus('') }} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="profile-first-name" className="text-sm font-medium">Имя</label><input id="profile-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={disabled} required maxLength={100} autoComplete="given-name" className={fieldClassName} /></div>
            <div><label htmlFor="profile-last-name" className="text-sm font-medium">Фамилия</label><input id="profile-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={disabled} required maxLength={100} autoComplete="family-name" className={fieldClassName} /></div>
          </div>
          <div>
            <label htmlFor="profile-email" className="text-sm font-medium">E-mail для входа</label>
            <input id="profile-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={disabled} required maxLength={254} autoComplete="email" className={fieldClassName} aria-describedby="profile-email-help" />
            <p id="profile-email-help" className="mt-2 text-xs text-muted-foreground">На этот адрес приходят письма для восстановления доступа. E-mail не показывается другим ученикам.</p>
          </div>
          {emailChanged && <PasswordField id="email-current-password" label="Текущий пароль для смены e-mail" value={emailPassword} onChange={setEmailPassword} disabled={disabled} autoComplete="current-password" />}
          <div>
            <label htmlFor="profile-telegram" className="text-sm font-medium">Telegram</label>
            <input id="profile-telegram" type="text" value={telegram} onChange={(event) => setTelegram(event.target.value)} disabled={disabled} maxLength={100} autoComplete="off" placeholder="@username или https://t.me/username" aria-describedby="profile-telegram-help" className={fieldClassName} />
            <p id="profile-telegram-help" className="mt-2 text-xs text-muted-foreground">Необязательно. Укажите имя пользователя или ссылку на свой профиль.</p>
          </div>
          <div>
            <label htmlFor="profile-bio" className="text-sm font-medium">О себе</label>
            <textarea id="profile-bio" value={bio} onChange={(event) => setBio(event.target.value)} disabled={disabled} maxLength={500} rows={4} className={`${fieldClassName} resize-y`} aria-describedby="profile-bio-help" placeholder="Чем занимаетесь и чему хотите научиться" />
            <p id="profile-bio-help" className="mt-2 text-xs text-muted-foreground">{bio.length}/500 символов</p>
          </div>
          {profileError && <p role="alert" className="text-sm text-destructive">{profileError}</p>}
          {profileStatus && <p role="status" className="text-sm text-success">{profileStatus}</p>}
          <button type="submit" disabled={disabled} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
            {saving === 'profile' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saving === 'profile' ? 'Сохраняем…' : 'Сохранить профиль'}
          </button>
        </div>
      </form>
      <form aria-label="Смена пароля" onSubmit={savePassword} onChangeCapture={() => setPasswordStatus('')} className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Безопасность</h2>
        <p className="mt-2 text-sm text-muted-foreground">Измените пароль, если его узнал кто-то ещё. Текущий вход сохранится, остальные устройства выйдут из аккаунта.</p>
        <div className="mt-5 space-y-4">
          <PasswordField id="security-current-password" label="Текущий пароль" value={currentPassword} onChange={setCurrentPassword} disabled={disabled} autoComplete="current-password" />
          <PasswordField id="security-new-password" label="Новый пароль" value={newPassword} onChange={setNewPassword} disabled={disabled} autoComplete="new-password" minLength={10} describedBy="password-rules" />
          <p id="password-rules" className="text-xs text-muted-foreground">Не менее 10 символов, включая буквы и цифры.</p>
          <PasswordField id="security-confirm-password" label="Повторите новый пароль" value={confirmation} onChange={setConfirmation} disabled={disabled} autoComplete="new-password" minLength={10} />
          {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
          {passwordStatus && <p role="status" className="text-sm text-success">{passwordStatus}</p>}
          <button type="submit" disabled={disabled} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-input px-4 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{saving === 'password' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{saving === 'password' ? 'Меняем пароль…' : 'Изменить пароль'}</button>
        </div>
      </form>
      <AppearanceSettings />
    </div>
  )
}
