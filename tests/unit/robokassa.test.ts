import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  buildPaymentUrl,
  fetchOperationState,
  formatExpirationDate,
  formatOutSum,
  noticeSignatureBase,
  parseOutSum,
  paymentSignatureBase,
  resultResponse,
  robokassaConfig,
  signatureHash,
  verifyResultNotice,
  verifySuccessReturn,
  type Receipt,
  type RobokassaConfig,
} from '@/server/robokassa'

const config: RobokassaConfig = { merchantLogin: 'shop', password1: 'pass1', password2: 'pass2', isTest: false, hash: 'sha256' }
const receipt: Receipt = {
  items: [{ name: 'Буткемп', quantity: 1, sum: 45000, payment_method: 'full_payment', payment_object: 'service', tax: 'none' }],
  sno: 'usn_income',
}
const base = { invId: 7, amountKopecks: 4500000, description: 'Буткемп', receipt }
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const md5 = (text: string) => createHash('md5').update(text).digest('hex')

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv

function signedResult(params: Record<string, string>, password = 'pass2', hash: 'md5' | 'sha256' = 'sha256'): Record<string, string> {
  const signature = signatureHash(hash, noticeSignatureBase(params.OutSum, params.InvId, password, params))
  return { ...params, SignatureValue: signature }
}

describe('робокасса: конфиг', () => {
  it('без любой из переменных - null', () => {
    expect(robokassaConfig(env({}))).toBeNull()
    expect(robokassaConfig(env({ ROBOKASSA_MERCHANT_LOGIN: 'a', ROBOKASSA_PASSWORD1: 'b' }))).toBeNull()
  })

  it('читает значения, тест и хеш по умолчанию sha256', () => {
    const vars = { ROBOKASSA_MERCHANT_LOGIN: 'a', ROBOKASSA_PASSWORD1: 'b', ROBOKASSA_PASSWORD2: 'c', ROBOKASSA_TEST_PASSWORD1: 't1', ROBOKASSA_TEST_PASSWORD2: 't2' }
    expect(robokassaConfig(env(vars))).toEqual({ merchantLogin: 'a', password1: 'b', password2: 'c', isTest: false, hash: 'sha256' })
    expect(robokassaConfig(env({ ...vars, ROBOKASSA_IS_TEST: 'true', ROBOKASSA_HASH: 'MD5' }))).toEqual({ merchantLogin: 'a', password1: 't1', password2: 't2', isTest: true, hash: 'md5' })
    expect(robokassaConfig(env({ ...vars, ROBOKASSA_IS_TEST: '1' }))?.isTest).toBe(true)
    expect(robokassaConfig(env({ ...vars, ROBOKASSA_IS_TEST: '0' }))?.password1).toBe('b')
  })

  it('тестовый режим без тестовых паролей - оплата не подключена, боевые пароли не подставляются', () => {
    expect(robokassaConfig(env({ ROBOKASSA_MERCHANT_LOGIN: 'a', ROBOKASSA_PASSWORD1: 'b', ROBOKASSA_PASSWORD2: 'c', ROBOKASSA_IS_TEST: '1' }))).toBeNull()
  })

  it('неверный хеш - ошибка без паролей', () => {
    const bad = env({ ROBOKASSA_MERCHANT_LOGIN: 'a', ROBOKASSA_PASSWORD1: 'secret1', ROBOKASSA_PASSWORD2: 'secret2', ROBOKASSA_HASH: 'sha1' })
    expect(() => robokassaConfig(bad)).toThrow('ROBOKASSA_HASH')
    expect(() => robokassaConfig(bad)).toThrow(/^(?!.*secret)/)
  })
})

describe('робокасса: суммы', () => {
  it('formatOutSum', () => {
    expect(formatOutSum(4500000)).toBe('45000.00')
    expect(formatOutSum(1)).toBe('0.01')
    expect(formatOutSum(105)).toBe('1.05')
    for (const bad of [0, -5, 1.5, Number.NaN]) expect(() => formatOutSum(bad)).toThrow()
  })

  it('parseOutSum принимает разумное', () => {
    expect(parseOutSum('45000.000000')).toBe(4500000)
    expect(parseOutSum('45000.00')).toBe(4500000)
    expect(parseOutSum('45000')).toBe(4500000)
    expect(parseOutSum('0.01')).toBe(1)
    expect(parseOutSum('1.500000')).toBe(150)
  })

  it('parseOutSum отвергает остальное', () => {
    for (const bad of ['1,5', '-1', ' 1', '1 ', '1e3', '', '1.', '.5', '1.005000', '1.0000001', '1'.repeat(21), 'abc', '12345678901234567890']) {
      expect(parseOutSum(bad), bad).toBeNull()
    }
  })
})

describe('робокасса: ссылка на оплату', () => {
  it('строка подписи: порядок частей и Shp по алфавиту', () => {
    const text = paymentSignatureBase(config, { outSum: '45000.00', invId: 7, encodedReceipt: 'R', shp: { b: '2', a: '1' } })
    expect(text).toBe('shop:45000.00:7:R:pass1:Shp_a=1:Shp_b=2')
  })

  it('подпись sha256 и md5 совпадает с ручным расчётом', () => {
    const encoded = encodeURIComponent(JSON.stringify(receipt))
    const text = `shop:45000.00:7:${encoded}:pass1:Shp_a=1:Shp_b=2`
    const shp = { b: '2', a: '1' }
    const url = new URL(buildPaymentUrl(config, { ...base, shp }))
    expect(url.searchParams.get('SignatureValue')).toBe(sha(text))
    const url5 = new URL(buildPaymentUrl({ ...config, hash: 'md5' }, { ...base, shp }))
    expect(url5.searchParams.get('SignatureValue')).toBe(md5(text))
  })

  it('Receipt: в подписи закодирован один раз, в URL после разбора та же строка', () => {
    const link = buildPaymentUrl(config, base)
    const encoded = encodeURIComponent(JSON.stringify(receipt))
    expect(new URL(link).searchParams.get('Receipt')).toBe(encoded)
    expect(link).toContain(`Receipt=${encodeURIComponent(encoded)}`)
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual(receipt)
  })

  it('параметры, Shp, Email, тест и срок', () => {
    const link = new URL(buildPaymentUrl({ ...config, isTest: true }, {
      ...base,
      email: 'a@b.ru',
      expiresAt: new Date('2026-11-01T10:30:00Z'),
      shp: { order: 'abc', Zed: 'z' },
    }))
    expect(`${link.origin}${link.pathname}`).toBe('https://auth.robokassa.ru/Merchant/Index.aspx')
    const p = link.searchParams
    expect(p.get('MerchantLogin')).toBe('shop')
    expect(p.get('OutSum')).toBe('45000.00')
    expect(p.get('InvId')).toBe('7')
    expect(p.get('Culture')).toBe('ru')
    expect(p.get('Encoding')).toBe('utf-8')
    expect(p.get('Email')).toBe('a@b.ru')
    expect(p.get('IsTest')).toBe('1')
    expect(p.get('Shp_order')).toBe('abc')
    expect(p.get('ExpirationDate')).toBe('2026-11-01T13:30')
    expect(buildPaymentUrl(config, base)).not.toContain('IsTest')
  })

  it('ExpirationDate по Москве, в том числе через полночь', () => {
    expect(formatExpirationDate(new Date('2026-12-31T21:05:59Z'))).toBe('2027-01-01T00:05')
  })

  it('проверки входа', () => {
    expect(() => buildPaymentUrl(config, { ...base, invId: 0 })).toThrow()
    expect(() => buildPaymentUrl(config, { ...base, invId: 2147483648 })).toThrow()
    expect(() => buildPaymentUrl(config, { ...base, invId: 1.5 })).toThrow()
    expect(() => buildPaymentUrl(config, { ...base, description: 'а'.repeat(101) })).toThrow('Описание')
    expect(() => buildPaymentUrl(config, { ...base, shp: { 'bad key': '1' } })).toThrow('Ключ')
    expect(() => buildPaymentUrl(config, { ...base, amountKopecks: 100 })).toThrow('не равна')
    const long = { ...receipt, items: [{ ...receipt.items[0], name: 'я'.repeat(129) }] }
    expect(() => buildPaymentUrl(config, { ...base, receipt: long })).toThrow('128')
  })
})

describe('робокасса: уведомления', () => {
  const params = { OutSum: '45000.000000', InvId: '7', Fee: '1.5', EMail: 'a@b.ru', PaymentMethod: 'BankCard', IncCurrLabel: 'BankCardPSR', Shp_b: '2', Shp_a: '1' }

  it('верная подпись, Shp в любом порядке', () => {
    const result = verifyResultNotice(config, signedResult(params))
    expect(result).toEqual({
      ok: true,
      notice: { invId: 7, amountKopecks: 4500000, outSum: '45000.000000', shp: { a: '1', b: '2' }, opKey: undefined, fee: '1.5', paymentMethod: 'BankCard', incCurrLabel: 'BankCardPSR', email: 'a@b.ru' },
    })
    const reordered = { Shp_a: '1', Shp_b: '2', ...signedResult(params) }
    expect(verifyResultNotice(config, reordered).ok).toBe(true)
  })

  it('строка подписи: Password2 и Shp по алфавиту', () => {
    expect(noticeSignatureBase('100.000000', '450009', 'P', { Shp_oplata: '1', Shp_login: 'Vasya' })).toBe('100.000000:450009:P:Shp_login=Vasya:Shp_oplata=1')
  })

  it('подпись в верхнем регистре и md5', () => {
    const signed = signedResult(params)
    expect(verifyResultNotice(config, { ...signed, SignatureValue: signed.SignatureValue.toUpperCase() }).ok).toBe(true)
    const md5Config = { ...config, hash: 'md5' as const }
    expect(verifyResultNotice(md5Config, signedResult(params, 'pass2', 'md5')).ok).toBe(true)
  })

  it('неверная подпись, подмена суммы и Shp, чужой пароль', () => {
    const signed = signedResult(params)
    expect(verifyResultNotice(config, { ...signed, SignatureValue: 'zz' })).toEqual({ ok: false, reason: 'signature' })
    expect(verifyResultNotice(config, { ...signed, SignatureValue: signed.SignatureValue.slice(2) })).toEqual({ ok: false, reason: 'signature' })
    expect(verifyResultNotice(config, { ...signed, OutSum: '1.000000' })).toEqual({ ok: false, reason: 'signature' })
    expect(verifyResultNotice(config, { ...signed, Shp_a: 'x' })).toEqual({ ok: false, reason: 'signature' })
    expect(verifyResultNotice(config, signedResult(params, 'pass1'))).toEqual({ ok: false, reason: 'signature' })
  })

  it('боевой магазин не принимает уведомление о тестовой операции, тестовый принимает', () => {
    const signed = { ...signedResult(params), IsTest: '1' }
    expect(verifyResultNotice(config, signed)).toEqual({ ok: false, reason: 'test' })
    expect(verifyResultNotice({ ...config, isTest: true }, signed).ok).toBe(true)
  })

  it('нет обязательных полей', () => {
    const signed = signedResult(params)
    for (const key of ['OutSum', 'InvId', 'SignatureValue']) {
      const { [key]: _removed, ...rest } = signed
      expect(verifyResultNotice(config, rest)).toEqual({ ok: false, reason: 'missing' })
    }
  })

  it('подписанная, но странная сумма и номер', () => {
    expect(verifyResultNotice(config, signedResult({ OutSum: '1.005000', InvId: '7' }))).toEqual({ ok: false, reason: 'amount' })
    expect(verifyResultNotice(config, signedResult({ OutSum: '0.00', InvId: '7' }))).toEqual({ ok: false, reason: 'amount' })
    expect(verifyResultNotice(config, signedResult({ OutSum: '10.00', InvId: 'abc' }))).toEqual({ ok: false, reason: 'inv_id' })
    expect(verifyResultNotice(config, signedResult({ OutSum: '10.00', InvId: '0' }))).toEqual({ ok: false, reason: 'inv_id' })
  })

  it('SuccessURL проверяется паролем 1', () => {
    const success = signedResult({ OutSum: '45000.00', InvId: '7', Culture: 'ru' }, 'pass1')
    expect(verifySuccessReturn(config, success).ok).toBe(true)
    expect(verifyResultNotice(config, success)).toEqual({ ok: false, reason: 'signature' })
  })

  it('ответ магазину', () => {
    expect(resultResponse(5)).toBe('OK5')
  })
})

describe('робокасса: OpStateExt', () => {
  const xml = (result: number, state: number | null, info = '') => `<?xml version="1.0" encoding="utf-8"?>
<OperationStateResponse xmlns="http://merchant.roboxchange.com/WebService/">
  <Result><Code>${result}</Code></Result>
  ${state === null ? '' : `<State><Code>${state}</Code><RequestDate>2026-10-31T10:00:00.1+03:00</RequestDate></State>`}
  ${info}
</OperationStateResponse>`
  const info = '<Info><IncCurrLabel>BankCardPSR</IncCurrLabel><IncSum>45000.000000</IncSum><OutSum>44000.500000</OutSum><OpKey>KEY1</OpKey></Info>'
  const ok = (body: string) => vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch

  it('оплачен, запрос подписан паролем 2', async () => {
    const fetchImpl = ok(xml(0, 100, info))
    const state = await fetchOperationState(config, 7, fetchImpl)
    expect(state).toEqual({ state: 'paid', stateCode: 100, amountKopecks: 4400050, opKey: 'KEY1', incCurrLabel: 'BankCardPSR' })
    const url = new URL((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt')
    expect(url.searchParams.get('MerchantLogin')).toBe('shop')
    expect(url.searchParams.get('InvoiceID')).toBe('7')
    expect(url.searchParams.get('Signature')).toBe(sha('shop:7:pass2'))
  })

  it('не найден, отменён, ожидает, возвращён, неизвестный', async () => {
    expect(await fetchOperationState(config, 7, ok(xml(3, null)))).toEqual({ state: 'not_found', stateCode: null })
    expect((await fetchOperationState(config, 7, ok(xml(0, 10)))).state).toBe('cancelled')
    for (const code of [5, 50, 80]) expect((await fetchOperationState(config, 7, ok(xml(0, code)))).state).toBe('pending')
    expect((await fetchOperationState(config, 7, ok(xml(0, 60)))).state).toBe('refunded')
    expect(await fetchOperationState(config, 7, ok(xml(0, 777)))).toEqual({ state: 'unknown', stateCode: 777 })
    expect((await fetchOperationState(config, 7, ok(xml(4, null)))).state).toBe('unknown')
  })

  it('ошибки: код результата, формат, HTTP, сеть, таймаут', async () => {
    await expect(fetchOperationState(config, 7, ok(xml(1, null)))).rejects.toThrow('код результата 1')
    await expect(fetchOperationState(config, 7, ok('<html>'))).rejects.toThrow('неожиданном формате')
    const http500 = vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    await expect(fetchOperationState(config, 7, http500)).rejects.toThrow('кодом 500')
    const down = vi.fn(async () => { throw new TypeError('fetch failed pass2') }) as unknown as typeof fetch
    const error = await fetchOperationState(config, 7, down).catch((e: Error) => e)
    expect((error as Error).message).toBe('Не удалось связаться с Робокассой')
    const slow = vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError') }) as unknown as typeof fetch
    await expect(fetchOperationState(config, 7, slow)).rejects.toThrow('10 секунд')
  })
})
