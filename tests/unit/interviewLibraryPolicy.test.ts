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
  it('Checkfrod требует согласие и корректную область кандидата; клиент не задаёт владельца', () => {
    expect(analysisInput({ consent: true, roiSpec: 'auto', owner: 999, url: 'private' })).toEqual({ consent: true, roiSpec: 'auto' })
    expect(analysisInput({ consent: true, roiSpec: '10,20,200,100' })).toEqual({ consent: true, roiSpec: '10,20,200,100' })
    for (const bad of [{}, { consent: false }, { consent: true, roiSpec: '0,0,1,10' }, { consent: true, roiSpec: '-1,0,20,20' }, { consent: true, roiSpec: '0,0,99999,99' }]) expect(() => analysisInput(bad)).toThrow()
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
