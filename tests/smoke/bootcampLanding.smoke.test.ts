import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { parseBootcampLead } from '@/lib/bootcamp-leads'
import { CONSENT_VERSION } from '../../landing/src/data/bootcamp'
import { OPERATOR } from '../../landing/src/data/privacy'

const nginx = readFileSync(new URL('../../landing/nginx.conf', import.meta.url), 'utf8')

describe('лендинг буткемпа: форма предзаписи', () => {
  // Без оператора в политике собирать заявки нельзя (152-ФЗ, ст. 18.1): тест не пускает выкат.
  it('в политике указан оператор персональных данных', () => {
    for (const key of ['name', 'inn', 'ogrn', 'address', 'email'] as const) {
      expect(OPERATOR[key].trim(), `landing/src/data/privacy.ts: заполните OPERATOR.${key}`).not.toBe('')
    }
  })

  it('версию согласия со страницы принимает сервер', () => {
    expect(parseBootcampLead({ program: 'nodejs', email: 'a@mail.ru', consent: true, consentVersion: CONSENT_VERSION }).consentVersion).toBe(CONSENT_VERSION)
  })

  it('nginx передаёт заявку в LMS с адресом клиента от Traefik и без своего', () => {
    const location = nginx.match(/location = \/api\/bootcamp\/leads \{([\s\S]*?)\n {4}\}/)?.[1] ?? ''
    expect(location).toContain('limit_except POST')
    expect(location).toMatch(/proxy_pass \$lms_app;/)
    expect(location).toContain('proxy_set_header X-Forwarded-For $http_x_forwarded_for;')
    expect(location).not.toContain('$proxy_add_x_forwarded_for')
    expect(location).not.toContain('add_header')
  })
})
