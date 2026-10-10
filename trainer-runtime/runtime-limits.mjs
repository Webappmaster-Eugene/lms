export function runtimeConcurrency(value = process.env.TRAINER_MAX_CONCURRENT) {
  if (value === undefined || value === '') return 2
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > 2) throw new Error('TRAINER_MAX_CONCURRENT должен быть 1 или 2')
  return limit
}
