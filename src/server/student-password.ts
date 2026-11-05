import { randomInt } from 'node:crypto'

import { passwordPolicyError } from '@/lib/profile'

// Без похожих знаков (l, I, O, 0, 1): пароль ученику часто пересылают или диктуют вручную.
const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const length = 14

export function generateStudentPassword(): string {
  for (;;) {
    const password = Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('')
    if (passwordPolicyError(password) === null) return password
  }
}
