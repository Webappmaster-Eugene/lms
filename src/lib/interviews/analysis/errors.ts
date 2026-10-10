/**
 * Ошибка, текст которой можно показать пользователю как есть.
 *
 * retryable — сбой на стороне модели или сети. LMS сохраняет failed без
 * автоматического платного повтора; новую попытку явно запускает владелец.
 * Ошибки входных данных или структуры ответа нужно исправить перед повтором.
 */
export class InterviewError extends Error {
  readonly retryable: boolean

  constructor(message: string, options: { retryable?: boolean } = {}) {
    super(message)
    this.name = 'InterviewError'
    this.retryable = options.retryable ?? false
  }
}
