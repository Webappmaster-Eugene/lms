/** Preview: pnpm exec tsx src/normalize-roadmaps.ts; add --apply for an explicit write. */
import { getPayload } from 'payload'
import config from './payload.config'
import { securePostgresAdapter } from './server/secure-postgres-adapter'
import { normalizeRoadmapSequences } from './lib/normalize-roadmap-sequences'

async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== '--apply' && !arg.startsWith('--slug='))
  if (unknown.length) throw new Error(`Неизвестные аргументы: ${unknown.join(', ')}`)
  const email = process.env.ROADMAP_NORMALIZE_ADMIN_EMAIL
  if (!email) throw new Error('Задайте ROADMAP_NORMALIZE_ADMIN_EMAIL для существующего администратора')
  const adapter = securePostgresAdapter({ pool: { connectionString: process.env.DATABASE_URL }, push: false })
  const payload = await getPayload({ config: {
    ...await config,
    // A preview must not run the application's seeds, schema push or production migrations.
    onInit: () => {},
    db: { ...adapter, allowIDOnCreate: adapter.allowIDOnCreate ?? false, name: adapter.name ?? 'postgres' },
  } })
  try {
    const { docs } = await payload.find({ collection: 'users', where: { email: { equals: email } }, depth: 0, limit: 2 })
    const admin = docs[0]
    if (docs.length !== 1 || !admin || admin.role !== 'admin') throw new Error('Не найден единственный администратор с указанным email')
    const slug = args.find((arg) => arg.startsWith('--slug='))?.slice('--slug='.length)
    const results = await normalizeRoadmapSequences(payload, admin, { apply: args.includes('--apply'), slug })
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
  } finally {
    await payload.destroy()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Ошибка нормализации роадмапов'}\n`)
    process.exit(1)
  })
