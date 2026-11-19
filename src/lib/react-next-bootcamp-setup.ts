/** Программа согласована 17.11.2026, цена обновлена по запросу 18.11.2026. Набор закрыт. */
export const REACT_NEXT_BOOTCAMP = {
  key: 'react-next',
  title: 'React + Next.js: frontend сервиса проката',
  shortTitle: 'React + Next.js',
  courseSlug: 'react-next-bootcamp-manuals',
  landingUrl: 'https://info.mentorcareer.ru/bootcamp/react-next/',
  priceKopecks: 2_000_000,
  paymentDueDays: 7,
  offerUrl: 'https://info.mentorcareer.ru/bootcamp/react-next/offer/',
  offerVersion: '2026-11-19',
  receiptItemName: 'Буткемп React + Next.js: frontend сервиса проката',
  gitlabCourseProject: 'react-next/course',
  gitlabStreamGroup: 'react-next-bootcamp',
  gradingProject: 'react-next-staff/grading',
  entryTaskSet: 'rental-frontend-js',
} as const

type SetupDocument = { id: number, [field: string]: unknown }

export type ReactNextProgramData = ReturnType<typeof reactNextProgramData>

export type BootcampSetupApi = {
  findCourse: (slug: string) => Promise<SetupDocument[]>
  findProgram: (key: string) => Promise<SetupDocument[]>
  createProgram: (data: ReactNextProgramData) => Promise<SetupDocument>
  readProgram: (id: number) => Promise<SetupDocument>
}

export function reactNextProgramData(manualsCourse: number) {
  if (!Number.isSafeInteger(manualsCourse) || manualsCourse <= 0) throw new Error('Нужен ID курса методичек')
  const { courseSlug: _courseSlug, ...settings } = REACT_NEXT_BOOTCAMP
  return { ...settings, isActive: false, manualsCourse }
}

const relationId = (value: unknown): unknown =>
  value && typeof value === 'object' && 'id' in value ? value.id : value

function verifyProgram(doc: SetupDocument, wanted: ReactNextProgramData) {
  // Набор действующего потока этим инструментом не закрывается и не открывается.
  const differences = Object.entries(wanted).filter(([field, value]) =>
    field !== 'isActive' && (field === 'manualsCourse' ? relationId(doc[field]) : doc[field]) !== value,
  ).map(([field]) => field)
  if (differences.length) {
    throw new Error(`У существующей программы отличаются поля: ${differences.join(', ')}. Автоматическая перезапись отключена`)
  }
}

/** Создаёт только отсутствующую программу; курс импортируется переносимым пакетом отдельно. */
export async function setupReactNextBootcamp(api: BootcampSetupApi, apply = false) {
  const courses = await api.findCourse(REACT_NEXT_BOOTCAMP.courseSlug)
  if (courses.length !== 1) {
    throw new Error('Нужен ровно один курс react-next-bootcamp-manuals: сначала импортируйте пакет методичек')
  }
  const course = courses[0]
  if (!course || course.assignedOnly !== true || course.isBootcamp !== true) {
    throw new Error('Курс должен иметь флаги «Буткемп» и «Только по назначению»')
  }
  const wanted = reactNextProgramData(course.id)
  const programs = await api.findProgram(wanted.key)
  if (programs.length > 1) throw new Error('Несколько программ с ключом react-next; запись остановлена')
  const existing = programs[0]
  if (existing) {
    verifyProgram(existing, wanted)
    return { action: 'unchanged' as const, id: existing.id, isActive: existing.isActive === true }
  }
  if (!apply) return { action: 'planned' as const, id: null, isActive: false }
  const created = await api.createProgram(wanted)
  const saved = await api.readProgram(created.id)
  verifyProgram(saved, wanted)
  if (saved.isActive !== false) throw new Error('LMS не сохранила закрытый набор: проверьте программу react-next')
  return { action: 'created' as const, id: saved.id, isActive: false }
}
