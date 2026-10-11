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
  it('принимает длинную MOV-запись размером 3,6 ГБ без загрузки содержимого в память', () => {
    const size = Math.floor(3.6 * 1024 ** 3)
    expect(uploadInput({ title: 'Длинный собес', directionId: 1, size, fileName: 'recording.mov', mimeType: 'video/quicktime' })).toMatchObject({ size, extension: 'mov', mimeType: 'video/quicktime' })
  })
  it('оценка требует согласие, грейд и формат; клиент не задаёт владельца или направление', () => {
    const input = { consent: true, targetGrade: 'middle', interviewFormat: 'technical' }
    expect(analysisInput(input)).toEqual({ ...input, vacancyText: '' })
    expect(analysisInput({ ...input, vacancyText: '  React-разработчик  ', candidateName: '  Анна  ' })).toEqual({ ...input, vacancyText: 'React-разработчик', candidateName: 'Анна' })
    for (const bad of [{}, { ...input, consent: false }, { ...input, targetGrade: 'expert' }, { ...input, interviewFormat: 'fraud' }, { ...input, owner: 999 }, { ...input, direction: 'Подменённое направление' }, { ...input, url: 'https://foreign.test/video.mp4' }, { ...input, roiSpec: 'auto' }]) expect(() => analysisInput(bad)).toThrow()
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
