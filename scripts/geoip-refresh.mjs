import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { Transform, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { setTimeout as delay } from 'node:timers/promises'

const directory = process.env.LMS_GEOIP_DIRECTORY || '/geoip'
const target = directory + '/dbip-city-lite.mmdb'
const metadataPath = directory + '/metadata.json'
await mkdir(directory, { recursive: true })
let stopped = false
let failures = 0
const shutdown = new AbortController()
const stop = () => { stopped = true; shutdown.abort() }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

async function refresh() {
  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  let previous
  try { previous = JSON.parse(await readFile(metadataPath, 'utf8')) } catch { /* First deployment has no public database yet. */ }
  try { if (previous?.month === month && (await stat(target)).size > 1024) return } catch { /* Download a missing public database. */ }
  const prior = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
  const temporary = target + '.tmp'
  try {
    for (const candidate of [month, prior]) {
      const response = await fetch(`https://download.db-ip.com/free/dbip-city-lite-${candidate}.mmdb.gz`, { signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(180_000)]), redirect: 'error' })
      if (response.status === 404) continue
      if (!response.ok || !response.body) throw new Error('GeoIP download unavailable')
      const limit = (max) => {
        let bytes = 0
        return new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; callback(bytes > max ? new Error('GeoIP database exceeds its public download budget') : null, chunk) } })
      }
      await pipeline(Readable.fromWeb(response.body), limit(128 * 1024 * 1024), createGunzip(), limit(256 * 1024 * 1024), createWriteStream(temporary, { mode: 0o644 }))
      const bytes = await stat(temporary)
      if (bytes.size < 1024) throw new Error('GeoIP database is incomplete')
      // MMDB has an unambiguous metadata marker. The app performs the full Reader validation.
      const { open } = await import('node:fs/promises')
      const file = await open(temporary, 'r')
      try {
        const tail = Buffer.alloc(Math.min(bytes.size, 128 * 1024))
        await file.read(tail, 0, tail.length, bytes.size - tail.length)
        if (!tail.includes(Buffer.from('MaxMind.com'))) throw new Error('GeoIP download is not an MMDB database')
      } finally { await file.close() }
      await rename(temporary, target)
      await writeFile(metadataPath, JSON.stringify({ month: candidate, refreshedAt: new Date().toISOString(), source: 'DB-IP Lite', license: 'CC BY 4.0', attribution: 'https://db-ip.com', bytes: bytes.size }) + '\n', { mode: 0o644 })
      process.stdout.write(JSON.stringify({ event: 'geoip_refreshed', month: candidate, bytes: bytes.size }) + '\n')
      return
    }
    throw new Error('GeoIP current and previous public releases unavailable')
  } finally { await unlink(temporary).catch(() => {}) }
}

while (!stopped) {
  try { await refresh(); failures = 0 } catch {
    failures += 1
    if (process.argv.includes('--once')) process.exitCode = 1
    process.stderr.write(JSON.stringify({ event: 'geoip_refresh_failed', previousDatabaseRetained: true }) + '\n')
  }
  if (process.argv.includes('--once')) break
  await delay(failures ? Math.min(30 * 60_000, 30_000 * 2 ** Math.min(failures, 6)) : 24 * 60 * 60 * 1000, undefined, { signal: shutdown.signal }).catch((error) => { if (!stopped) throw error })
}
