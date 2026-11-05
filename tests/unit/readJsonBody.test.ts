import { describe, expect, it } from 'vitest'
import { readBoundedJson, readRequestForm } from '@/server/read-json-body'

const request = (body: BodyInit, headers: HeadersInit = { 'content-type': 'application/json' }) => new Request('https://lms.test/api/learning-state', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)

describe('ограниченное чтение пользовательского JSON', () => {
  it('принимает JSON с charset и считает байты UTF-8', async () => {
    const value = JSON.stringify({ message: 'Привет' })
    const bytes = new TextEncoder().encode(value)
    await expect(readBoundedJson(request(bytes, { 'content-type': 'application/json; charset=utf-8' }), bytes.byteLength)).resolves.toEqual({ message: 'Привет' })
    await expect(readBoundedJson(request(bytes), bytes.byteLength - 1)).rejects.toMatchObject({ status: 413 })
  })

  it('останавливает поток без Content-Length до чтения остальных частей', async () => {
    let cancelled = false
    let reads = 0
    const stream = new ReadableStream({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(100)) },
      cancel() { cancelled = true },
    })
    await expect(readBoundedJson(request(stream), 150)).rejects.toMatchObject({ status: 413 })
    expect(cancelled).toBe(true)
    expect(reads).toBeLessThanOrEqual(3)
  })

  it('не доверяет малому заявленному Content-Length', async () => {
    await expect(readBoundedJson(request('x'.repeat(200), { 'content-type': 'application/json', 'content-length': '2' }), 100)).rejects.toMatchObject({ status: 413 })
  })

  it('отвергает другой тип, испорченный JSON и невалидную кодировку', async () => {
    await expect(readBoundedJson(request('{}', { 'content-type': 'text/plain' }), 100)).rejects.toMatchObject({ status: 415 })
    await expect(readBoundedJson(request('{broken'), 100)).rejects.toMatchObject({ status: 400 })
    await expect(readBoundedJson(request(new Uint8Array([255, 254])), 100)).rejects.toMatchObject({ status: 400 })
  })
})

describe('ограниченное чтение формы с файлом', () => {
  const multipart = { 'content-type': 'multipart/form-data; boundary=x' }
  const part = '--x\r\nContent-Disposition: form-data; name="name"\r\n\r\nИван\r\n--x--\r\n'

  it('разбирает форму и отклоняет другой тип', async () => {
    expect((await readRequestForm(request(part, multipart), 1024)).get('name')).toBe('Иван')
    await expect(readRequestForm(request(part), 1024)).rejects.toMatchObject({ status: 415 })
  })

  it('считает предел при чтении, а заголовку длины не верит', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2048)); controller.close() } })
    await expect(readRequestForm(request(stream, multipart), 1024)).rejects.toMatchObject({ status: 413 })
  })

  it('тело, которое не дослали в срок, не держит заявку', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('--x')) } })
    await expect(readRequestForm(request(stream, multipart), 1024, 20)).rejects.toMatchObject({ status: 400, message: 'Передача данных запроса прервана' })
  })
})
