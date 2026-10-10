import { createHash } from 'node:crypto'
import { createClient } from 'redis'

const TTL_SECONDS = 300
const MAX_VALUE_BYTES = 4 * 1024 * 1024
const MAX_LOCAL_BYTES = 16 * 1024 * 1024
const MAX_ENTRIES = 128
const REDIS_TIMEOUT_MS = 150
const RETRY_AFTER_MS = 30_000

type Entry = { json: string; expiresAt: number; bytes: number }
const local = new Map<string, Entry>()
const flights = new Map<string, Promise<string>>()
let localBytes = 0
let client: ReturnType<typeof createClient> | undefined
let connecting: Promise<void> | undefined
let retryAt = 0
let warningAt = 0

function unavailable() {
  retryAt = Date.now() + RETRY_AFTER_MS
  if (Date.now() >= warningAt) {
    warningAt = retryAt
    console.warn('[content-cache] Redis недоступен; используется локальный кеш и Payload')
  }
}

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Cache timeout')), REDIS_TIMEOUT_MS) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function redisClient() {
  if (!process.env.REDIS_URL || Date.now() < retryAt) return undefined
  try {
    if (!client) {
      client = createClient({
        url: process.env.REDIS_URL,
        socket: { connectTimeout: REDIS_TIMEOUT_MS, reconnectStrategy: false },
        disableOfflineQueue: true,
        commandsQueueMaxLength: MAX_ENTRIES,
      })
      client.on('error', unavailable)
    }
    if (!client.isReady) {
      if (!connecting) connecting = client.connect().then(() => undefined).finally(() => { connecting = undefined })
      await bounded(connecting)
    }
    return client
  } catch {
    if (client?.isOpen) client.destroy()
    client = undefined
    unavailable()
    return undefined
  }
}

async function readRedis(key: string): Promise<string | null> {
  const redis = await redisClient()
  if (!redis) return null
  try { return await bounded(redis.get(key)) } catch {
    if (redis.isOpen) redis.destroy()
    if (client === redis) client = undefined
    unavailable()
    return null
  }
}

async function writeRedis(key: string, json: string): Promise<void> {
  const redis = await redisClient()
  if (!redis) return
  try { await bounded(redis.set(key, json, { EX: TTL_SECONDS })) } catch {
    if (redis.isOpen) redis.destroy()
    if (client === redis) client = undefined
    unavailable()
  }
}

function forget(key: string) {
  const entry = local.get(key)
  if (entry) localBytes -= entry.bytes
  local.delete(key)
}

function remember(key: string, json: string) {
  const bytes = Buffer.byteLength(json)
  if (bytes > MAX_VALUE_BYTES) return
  forget(key)
  while (local.size >= MAX_ENTRIES || localBytes + bytes > MAX_LOCAL_BYTES) {
    const oldest = local.keys().next().value
    if (oldest === undefined) break
    forget(oldest)
  }
  local.set(key, { json, bytes, expiresAt: Date.now() + TTL_SECONDS * 1000 })
  localBytes += bytes
}

function decode<T>(json: string, valid: (value: unknown) => value is T): T | undefined {
  if (Buffer.byteLength(json) > MAX_VALUE_BYTES) return undefined
  try {
    const value: unknown = JSON.parse(json)
    return valid(value) ? value : undefined
  } catch { return undefined }
}

/** Only immutable, revision-keyed, allowlisted catalog DTOs belong here. */
export async function cachedContent<T>(key: string, load: () => Promise<T>, valid: (value: unknown) => value is T, stable: () => Promise<boolean>): Promise<T> {
  const entry = local.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    const value = decode(entry.json, valid)
    if (value !== undefined) return value
  }
  forget(key)
  const pending = flights.get(key)
  if (pending) return JSON.parse(await pending) as T
  if (flights.size >= MAX_ENTRIES) return load()
  const flight = (async () => {
    const remote = await readRedis(key)
    if (remote && decode(remote, valid) !== undefined) {
      remember(key, remote)
      return remote
    }
    const value = await load()
    const json = JSON.stringify(value)
    if (Buffer.byteLength(json) <= MAX_VALUE_BYTES && await stable()) {
      remember(key, json)
      await writeRedis(key, json)
    }
    return json
  })()
  flights.set(key, flight)
  try { return JSON.parse(await flight) as T } finally { flights.delete(key) }
}

export function contentCacheKey(scope: string, revision: string) {
  // Hash the identity, never expose the database URL or its credentials in Redis keys.
  const database = createHash('sha256').update(process.env.DATABASE_URL ?? 'local').digest('hex').slice(0, 20)
  return `lms:content:v1:${database}:${scope}:${revision}`
}
