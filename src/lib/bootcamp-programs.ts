/**
 * Программа буткемпа в том виде, в каком её используют заявка, допуск, оплата и
 * зачисление. Источник - коллекция bootcamp-programs; модуль общий для сервера и панели.
 */

/** Ключ программы: в заявках, в форме лендинга и в адресах страниц. */
export const PROGRAM_KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

export type BootcampProgramConfig = {
  id: number
  key: string
  title: string
  shortTitle: string
  isActive: boolean
  landingUrl: string
  priceKopecks: number
  paymentDueDays: number
  offerUrl: string
  offerVersion: string
  receiptItemName: string
  manualsCourseId: number | null
  gitlabCourseProject: string
  gitlabStreamGroup: string
  gradingProject: string
  entryTaskSet: string
}

type ProgramDoc = {
  id: number
  key: string
  title: string
  shortTitle: string
  isActive?: boolean | null
  landingUrl: string
  priceKopecks: number
  paymentDueDays: number
  offerUrl: string
  offerVersion: string
  receiptItemName: string
  manualsCourse?: number | { id: number } | null
  gitlabCourseProject: string
  gitlabStreamGroup: string
  gradingProject: string
  entryTaskSet: string
}

export function toProgramConfig(doc: ProgramDoc): BootcampProgramConfig {
  const course = doc.manualsCourse
  return {
    id: doc.id,
    key: doc.key,
    title: doc.title,
    shortTitle: doc.shortTitle,
    isActive: doc.isActive !== false,
    landingUrl: doc.landingUrl,
    priceKopecks: doc.priceKopecks,
    paymentDueDays: doc.paymentDueDays,
    offerUrl: doc.offerUrl,
    offerVersion: doc.offerVersion,
    receiptItemName: doc.receiptItemName,
    manualsCourseId: course === null || course === undefined ? null : typeof course === 'object' ? course.id : course,
    gitlabCourseProject: doc.gitlabCourseProject,
    gitlabStreamGroup: doc.gitlabStreamGroup,
    gradingProject: doc.gradingProject,
    entryTaskSet: doc.entryTaskSet,
  }
}
