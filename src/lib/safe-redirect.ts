/**
 * Адрес возврата после входа (`/login?redirect=…`). Параметр приходит из ссылки,
 * поэтому пропускаем только путь внутри приложения: иначе ссылка
 * `/login?redirect=https://evil.example` после ввода пароля уводит на фишинговый сайт.
 */
// «//host» и «/\host» браузер понимает как адрес другого сайта
const leavesSite = (path: string): boolean => path.startsWith('//') || path.startsWith('/\\')

export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || leavesSite(value)) return fallback

  const base = 'http://app.invalid'
  let url: URL
  try {
    url = new URL(value, base)
  } catch {
    return fallback
  }
  if (url.origin !== base) return fallback

  // Нормализация схлопывает «/a/..//host» в «//host», поэтому результат проверяется заново.
  const path = `${url.pathname}${url.search}${url.hash}`
  return leavesSite(path) ? fallback : path
}
