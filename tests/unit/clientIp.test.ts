import { afterEach, describe, expect, it, vi } from 'vitest'

import { trustedClientIp } from '@/server/client-ip'

const ip = (forwarded: string) => trustedClientIp(new Headers({ 'X-Forwarded-For': forwarded }))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('адрес клиента за двумя Traefik', () => {
  it('без LMS_TRUST_PROXY заголовку не верит', () => {
    vi.stubEnv('LMS_TRUST_PROXY', '')
    expect(ip('203.0.113.7')).toBeNull()
  })

  it('пропускает справа адреса прокси: туннель VDS, Docker, loopback', () => {
    vi.stubEnv('LMS_TRUST_PROXY', 'true')
    // Так приходит запрос в домашнюю VM: клиента дописал Traefik на VDS, адрес VDS в туннеле — Traefik в VM.
    expect(ip('203.0.113.7, 10.77.0.1')).toBe('203.0.113.7')
    expect(ip('203.0.113.7, 10.77.0.1, 172.18.0.5')).toBe('203.0.113.7')
    expect(ip('2001:db8::5, ::ffff:10.77.0.1')).toBe('2001:db8::5')
    expect(ip('::ffff:198.51.100.9')).toBe('198.51.100.9')
  })

  it('не берёт подставленный клиентом адрес левее настоящего', () => {
    vi.stubEnv('LMS_TRUST_PROXY', 'true')
    expect(ip('1.1.1.1, 203.0.113.7, 10.77.0.1')).toBe('203.0.113.7')
  })

  it('мусор и цепочка только из внутренних адресов — адреса нет', () => {
    vi.stubEnv('LMS_TRUST_PROXY', 'true')
    expect(ip('10.77.0.1, 127.0.0.1')).toBeNull()
    expect(ip('203.0.113.7, not-an-ip')).toBeNull()
    expect(ip(`${'203.0.113.7, '.repeat(80)}10.77.0.1`)).toBeNull()
  })
})
