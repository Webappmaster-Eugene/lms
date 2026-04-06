/**
 * seed-roadmaps.ts — CLI entry-point для засидивания роадмапов.
 *
 * Запуск: pnpm exec payload run src/seed-roadmaps.ts
 *
 * Вся логика и данные находятся в src/lib/seed-roadmap-runner.ts.
 * Этот файл только инициализирует Payload и вызывает runner.
 */

import { getPayload } from 'payload'
import config from './payload.config'
import { seedRoadmapNodes } from './lib/seed-roadmap-runner'

async function main() {
  const payload = await getPayload({ config })
  await seedRoadmapNodes(payload)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
