import { afterEach, describe, expect, it, vi } from 'vitest'
import { validInterviewOrigin } from '@/server/interviews/route'
import { analysisInput, uploadInput } from '@/server/interviews/service'
import { MAX_RECORDING_BYTES } from '@/lib/interviews/types'

afterEach(() => vi.unstubAllEnvs())
describe('границы запросов библиотеки собеседований', () => {
  it('размер, формат, направление и длина проверяются до хранилища', () => {
    const input = { title: ' React ', directionId: 1, size: 128, fileName: 'interview.mp4', mimeType: 'video/mp4' }
    expect(uploadInput(input)).toMatchObject({ title: 'React', extension: 'mp4', size: 128 })
    for (const changed of [{ size: MAX_RECORDING_BYTES + 1 }, { size: 0 }, { size: 1.5 }, { directionId: '1' }, { title: 'a'.repeat(201) }, { fileName: 'test.html', mimeType: 'text/html' }, { mimeType: 'video/webm' }, { description: 'a'.repeat(2001) }]) expect(() => uploadInput({ ...input, ...changed })).toThrow()
  })
  it('вакансия и имя имеют пределы; неизвестные поля не передаются анализатору', () => {
    expect(analysisInput({ candidateName: ' Иван ', owner: 999, publicKey: 'private' })).toEqual({ candidateName: 'Иван', candidateSpeaker: '', vacancyText: '' })
    expect(() => analysisInput({ vacancyText: 'x'.repeat(20001) })).toThrow()
    expect(() => analysisInput({ candidateSpeaker: { wrong: true } })).toThrow()
  })
  it('cookie мутации требуют нашего Origin, а явный токен не принимает чужой Origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
    const request = (headers: Record<string, string>) => new Request('http://lms.test/api/interviews', { method: 'POST', headers })
    expect(validInterviewOrigin(request({}))).toBe(false)
    expect(validInterviewOrigin(request({ Origin: 'https://learn.mentorcareer.ru' }))).toBe(true)
    expect(validInterviewOrigin(request({ Origin: 'https://evil.test', Authorization: 'JWT test' }))).toBe(false)
    expect(validInterviewOrigin(request({ Authorization: 'JWT test' }))).toBe(true)
    expect(validInterviewOrigin(request({ Origin: 'http://lms.test', 'Sec-Fetch-Site': 'same-site' }))).toBe(false)
    expect(validInterviewOrigin(request({ Host: 'evil.test', Origin: 'http://evil.test' }))).toBe(false)
  })
})
