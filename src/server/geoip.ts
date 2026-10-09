// Payload CLI imports session hooks; all consumers of this module are server code.
import { isIP } from 'node:net'
import { open, type CityResponse, type Reader } from 'maxmind'
import { logger } from '@/lib/telemetry'

export interface GeoIpLocation {
  countryCode: string | null
  country: string | null
  region: string | null
  city: string | null
  source: 'local-mmdb' | 'unknown'
}

const unknown: GeoIpLocation = { countryCode: null, country: null, region: null, city: null, source: 'unknown' }
let database: { path: string; reader: Promise<Reader<CityResponse> | null> } | null = null
let retryAt = 0

export async function lookupGeoIp(ip: string): Promise<GeoIpLocation> {
  if (!isIP(ip)) return unknown
  const path = process.env.LMS_GEOIP_DATABASE_PATH
  if (!path || Date.now() < retryAt) return unknown
  if (!database || database.path !== path) {
    database = {
      path,
      reader: open<CityResponse>(path, { cache: { max: 1000 }, watchForUpdates: true, watchForUpdatesNonPersistent: true }).catch(() => {
        database = null
        retryAt = Date.now() + 5 * 60_000
        logger.warn('GeoIP database unavailable; session location remains unknown')
        return null
      }),
    }
  }
  const reader = await database.reader
  if (!reader) return unknown
  let record
  try { record = reader.get(ip) } catch {
    database = null
    retryAt = Date.now() + 5 * 60_000
    logger.warn('GeoIP lookup unavailable; session location remains unknown')
    return unknown
  }
  if (!record?.country?.iso_code) return unknown
  return {
    countryCode: record.country.iso_code.slice(0, 3),
    country: (record.country.names?.ru ?? record.country.names?.en ?? record.country.iso_code).slice(0, 100),
    city: (record.city?.names?.ru ?? record.city?.names?.en)?.slice(0, 100) ?? null,
    region: (record.subdivisions?.[0]?.names?.ru ?? record.subdivisions?.[0]?.names?.en)?.slice(0, 100) ?? null,
    source: 'local-mmdb',
  }
}
