import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const maxmind = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('maxmind', () => maxmind)
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/lib/telemetry', () => ({ logger }))

const UNKNOWN = { countryCode: null, country: null, region: null, city: null, source: 'unknown' }

/** Состояние модуля (открытая база, пауза повтора) живёт в замыкании — каждому тесту свой экземпляр. */
async function freshLookup() {
  vi.resetModules()
  return (await import('@/server/geoip')).lookupGeoIp
}

function reader(get: (ip: string) => unknown) {
  return { get: vi.fn(get) }
}

beforeEach(() => {
  maxmind.open.mockReset()
  logger.warn.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-26T10:00:00Z'))
  vi.stubEnv('LMS_GEOIP_DATABASE_PATH', '/data/geoip/city.mmdb')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('определение места входа по IP', () => {
  it('не IP-адрес и выключенная база не открывают файл', async () => {
    const lookup = await freshLookup()
    expect(await lookup('не-адрес')).toEqual(UNKNOWN)
    vi.stubEnv('LMS_GEOIP_DATABASE_PATH', '')
    expect(await lookup('8.8.8.8')).toEqual(UNKNOWN)
    expect(maxmind.open).not.toHaveBeenCalled()
  })

  it('берёт русские названия и обрезает их до размеров колонок', async () => {
    maxmind.open.mockResolvedValue(reader(() => ({
      country: { iso_code: 'RUSX', names: { ru: 'Р'.repeat(150), en: 'Russia' } },
      city: { names: { ru: 'Москва', en: 'Moscow' } },
      subdivisions: [{ names: { ru: 'Москва (регион)', en: 'Moscow' } }],
    })))
    const lookup = await freshLookup()
    expect(await lookup('8.8.8.8')).toEqual({ countryCode: 'RUS', country: 'Р'.repeat(100), city: 'Москва', region: 'Москва (регион)', source: 'local-mmdb' })
    expect(maxmind.open).toHaveBeenCalledWith('/data/geoip/city.mmdb', expect.objectContaining({ watchForUpdates: true }))
  })

  it('без русских названий берёт английские, без них — код страны; город и регион могут отсутствовать', async () => {
    maxmind.open.mockResolvedValue(reader((ip) => ip === '1.1.1.1'
      ? { country: { iso_code: 'DE', names: { en: 'Germany' } }, city: { names: { en: 'Berlin' } }, subdivisions: [{ names: { en: 'Land Berlin' } }] }
      : { country: { iso_code: 'KZ' } }))
    const lookup = await freshLookup()
    expect(await lookup('1.1.1.1')).toEqual({ countryCode: 'DE', country: 'Germany', city: 'Berlin', region: 'Land Berlin', source: 'local-mmdb' })
    expect(await lookup('2.2.2.2')).toEqual({ countryCode: 'KZ', country: 'KZ', city: null, region: null, source: 'local-mmdb' })
    // Одна база на процесс: второй адрес не открывает файл повторно.
    expect(maxmind.open).toHaveBeenCalledTimes(1)
  })

  it('адрес без страны в базе остаётся неизвестным', async () => {
    maxmind.open.mockResolvedValue(reader(() => ({ city: { names: { ru: 'Где-то' } } })))
    const lookup = await freshLookup()
    expect(await lookup('9.9.9.9')).toEqual(UNKNOWN)
  })

  it('недоступная база не роняет вход и не открывается снова раньше чем через 5 минут', async () => {
    maxmind.open.mockRejectedValueOnce(new Error('ENOENT'))
    const lookup = await freshLookup()
    expect(await lookup('8.8.8.8')).toEqual(UNKNOWN)
    expect(logger.warn).toHaveBeenCalledWith('GeoIP database unavailable; session location remains unknown')
    vi.setSystemTime(new Date('2026-10-26T10:04:59Z'))
    expect(await lookup('8.8.8.8')).toEqual(UNKNOWN)
    expect(maxmind.open).toHaveBeenCalledTimes(1)

    maxmind.open.mockResolvedValue(reader(() => ({ country: { iso_code: 'RU', names: { ru: 'Россия' } } })))
    vi.setSystemTime(new Date('2026-10-26T10:05:01Z'))
    expect(await lookup('8.8.8.8')).toMatchObject({ countryCode: 'RU', country: 'Россия' })
    expect(maxmind.open).toHaveBeenCalledTimes(2)
  })

  it('сбой чтения записи — неизвестное место, пауза и повторное открытие базы после неё', async () => {
    maxmind.open.mockResolvedValueOnce(reader(() => { throw new Error('corrupted search tree') }))
    const lookup = await freshLookup()
    expect(await lookup('8.8.8.8')).toEqual(UNKNOWN)
    expect(logger.warn).toHaveBeenCalledWith('GeoIP lookup unavailable; session location remains unknown')
    expect(await lookup('8.8.8.8')).toEqual(UNKNOWN)
    expect(maxmind.open).toHaveBeenCalledTimes(1)

    maxmind.open.mockResolvedValueOnce(reader(() => ({ country: { iso_code: 'AM', names: { ru: 'Армения' } } })))
    vi.setSystemTime(new Date('2026-10-26T10:06:00Z'))
    expect(await lookup('8.8.8.8')).toMatchObject({ countryCode: 'AM' })
    expect(maxmind.open).toHaveBeenCalledTimes(2)
  })

  it('смена пути к базе открывает новый файл', async () => {
    maxmind.open.mockResolvedValue(reader(() => ({ country: { iso_code: 'RU' } })))
    const lookup = await freshLookup()
    await lookup('8.8.8.8')
    vi.stubEnv('LMS_GEOIP_DATABASE_PATH', '/data/geoip/fresh.mmdb')
    await lookup('8.8.8.8')
    expect(maxmind.open.mock.calls.map(([path]) => path)).toEqual(['/data/geoip/city.mmdb', '/data/geoip/fresh.mmdb'])
  })
})
