/**
 * Адрес возврата после входа (`/login?redirect=…`). Параметр приходит из ссылки,
 * поэтому пропускаем только путь внутри приложения: иначе ссылка
 * `/login?redirect=https://evil.example` после ввода пароля уводит на фишинговый сайт.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/')) return fallback
  // «//host» и «/\host» браузер понимает как адрес другого сайта
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback

  const base = 'http://app.invalid'
  let url: URL
  try {
    url = new URL(value, base)
  } catch {
    return fallback
  }
  if (url.origin !== base) return fallback

  return `${url.pathname}${url.search}${url.hash}`
}
