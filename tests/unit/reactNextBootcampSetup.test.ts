import { describe, expect, it, vi } from 'vitest'

import { REACT_NEXT_BOOTCAMP, reactNextProgramData, setupReactNextBootcamp, type BootcampSetupApi } from '@/lib/react-next-bootcamp-setup'

const course = { id: 42, assignedOnly: true, isBootcamp: true }

function fixture() {
  const saved = { id: 7, ...reactNextProgramData(course.id) }
  const api: BootcampSetupApi = {
    findCourse: vi.fn().mockResolvedValue([course]),
    findProgram: vi.fn().mockResolvedValue([]),
    createProgram: vi.fn().mockResolvedValue(saved),
    readProgram: vi.fn().mockResolvedValue(saved),
  }
  return { api, saved }
}

describe('настройка программы React + Next.js', () => {
  it('до явного apply показывает план без записи', async () => {
    const { api } = fixture()
    expect(await setupReactNextBootcamp(api)).toEqual({ action: 'planned', id: null, isActive: false })
    expect(api.findCourse).toHaveBeenCalledWith('react-next-bootcamp-manuals')
    expect(api.createProgram).not.toHaveBeenCalled()
  })

  it('создаёт программу с согласованными условиями и перечитывает результат', async () => {
    const { api } = fixture()
    expect(await setupReactNextBootcamp(api, true)).toEqual({ action: 'created', id: 7, isActive: false })
    expect(api.createProgram).toHaveBeenCalledWith(expect.objectContaining({
      key: 'react-next', priceKopecks: 4_500_000, manualsCourse: course.id,
      isActive: false, entryTaskSet: 'rental-frontend-js',
    }))
    expect(api.readProgram).toHaveBeenCalledWith(7)
    expect(REACT_NEXT_BOOTCAMP).not.toHaveProperty('startDate')
  })

  it('повторный запуск не дублирует программу и не закрывает действующий набор', async () => {
    const { api, saved } = fixture()
    vi.mocked(api.findProgram).mockResolvedValue([{ ...saved, isActive: true, manualsCourse: { id: course.id } }])
    expect(await setupReactNextBootcamp(api, true)).toEqual({ action: 'unchanged', id: 7, isActive: true })
    expect(api.createProgram).not.toHaveBeenCalled()
  })

  it.each([
    [],
    [course, { ...course, id: 43 }],
    [{ ...course, assignedOnly: false }],
    [{ ...course, isBootcamp: false }],
  ])('не пишет при отсутствующем, неоднозначном или открытом курсе: %j', async (...docs) => {
    const { api } = fixture()
    vi.mocked(api.findCourse).mockResolvedValue(docs)
    await expect(setupReactNextBootcamp(api, true)).rejects.toThrow()
    expect(api.createProgram).not.toHaveBeenCalled()
  })

  it('не перезаписывает условия существующей программы', async () => {
    const { api, saved } = fixture()
    vi.mocked(api.findProgram).mockResolvedValue([{ ...saved, priceKopecks: 100 }])
    await expect(setupReactNextBootcamp(api, true)).rejects.toThrow('priceKopecks')
    expect(api.createProgram).not.toHaveBeenCalled()
  })

  it('обнаруживает потерю настройки закрытого набора после записи', async () => {
    const { api, saved } = fixture()
    vi.mocked(api.readProgram).mockResolvedValue({ ...saved, isActive: true })
    await expect(setupReactNextBootcamp(api, true)).rejects.toThrow('не сохранила закрытый набор')
  })

  it('обнаруживает несохранённую привязку к методичкам', async () => {
    const { api, saved } = fixture()
    vi.mocked(api.readProgram).mockResolvedValue({ ...saved, manualsCourse: null })
    await expect(setupReactNextBootcamp(api, true)).rejects.toThrow('manualsCourse')
  })

  it.each([0, -1, 0.5, NaN])('отклоняет некорректный ID курса %s', (id) => {
    expect(() => reactNextProgramData(id)).toThrow('ID курса')
  })
})
