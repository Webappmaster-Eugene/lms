/**
 * Запросы браузера к своему API. Обе функции нужны затем, чтобы пользователь не
 * видел сообщений на английском: браузер описывает обрыв сети как «Failed to fetch»
 * (Safari — «Load failed»), а прокси перед приложением отвечает на 502/504 HTML-
 * страницей или текстом, и response.json() бросает ошибку парсера.
 */

export const NETWORK_ERROR_MESSAGE = 'Нет связи с сервером. Проверьте подключение и повторите попытку'

/** fetch, который при обрыве сети бросает Error с русским текстом; отмену пропускает как есть. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (cause) {
    if ((cause as { name?: unknown } | null)?.name === 'AbortError') throw cause
    throw new Error(NETWORK_ERROR_MESSAGE, { cause })
  }
}

/** Тело ответа как JSON или null, если это не JSON — тогда вызывающий показывает свою фразу. */
export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}
