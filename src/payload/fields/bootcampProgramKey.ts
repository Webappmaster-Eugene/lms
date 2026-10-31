import { PROGRAM_KEY_PATTERN } from '@/lib/bootcamp-programs'

/** Формат ключа программы. Есть ли такая программа, проверяет сервер при приёме заявки. */
export const validateProgramKey = (value: unknown) =>
  typeof value === 'string' && PROGRAM_KEY_PATTERN.test(value) ? true : 'Ключ программы: латинские буквы, цифры и дефис, с буквы'
