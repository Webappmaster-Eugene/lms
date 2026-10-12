/**
 * Next передаёт параметр маршрута так, как он записан в адресе: кириллический slug
 * приходит в percent-encoding и не совпадает со значением в базе.
 */
export function routeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
