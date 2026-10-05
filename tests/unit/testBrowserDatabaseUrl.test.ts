import { describe, expect, it } from 'vitest'
import { browserServerUrl } from '../../scripts/test-db.mjs'

describe('Postgres для браузерных тестов в Docker', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('меняет loopback %s на адрес хоста, сохраняя порт и параметры подключения', (host) => {
    const original = `postgresql://test:fixture@${host}:55433?application_name=browser-check`
    const result = new URL(browserServerUrl(original))
    expect(result.hostname).toBe('host.docker.internal')
    expect(result.port).toBe('55433')
    expect(result.username).toBe('test')
    expect(result.password).toBe('fixture')
    expect(result.searchParams.get('application_name')).toBe('browser-check')
    expect(new URL(original).hostname).toBe(host)
  })

  it('сохраняет явный адрес отдельного тестового сервера', () => {
    const original = 'postgresql://test:fixture@postgres.test:5432'
    expect(browserServerUrl(original)).toBe(original)
  })
})
