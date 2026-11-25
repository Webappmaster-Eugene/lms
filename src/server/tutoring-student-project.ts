import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import { tutoringHttpsUrl, type TutoringProgram } from '@/lib/tutoring'
import { findProgram } from '@/server/bootcamp-programs'

export async function tutoringProject(payload: Payload, req: PayloadRequest, student: number, program: TutoringProgram) {
  const { docs } = await payload.find({
    collection: 'tutoring-projects', req, limit: 1, depth: 0, overrideAccess: true,
    where: { and: [{ student: { equals: student } }, { program: { equals: program } }] },
  })
  return docs[0] ?? null
}

export function tutoringMergeRequest(projectUrl: string, mr: string): number | null {
  if (!tutoringHttpsUrl(mr)) return null
  const base = new URL(projectUrl)
  const url = new URL(mr)
  const prefix = base.pathname.replace(/\/$/, '') + '/-/merge_requests/'
  if (base.origin !== url.origin || !url.pathname.startsWith(prefix)) return null
  const iid = url.pathname.slice(prefix.length)
  return /^[1-9]\d{0,9}$/.test(iid) ? Number(iid) : null
}

export async function tutoringHomeworkProject(payload: Payload, req: PayloadRequest, student: number, program: TutoringProgram) {
  const project = await tutoringProject(payload, req, student, program)
  if (project) return { project, waiting: project.state !== 'ready' || !project.projectUrl }
  const settings = await findProgram(payload, program, req)
  const waiting = Boolean(settings?.mentoringGitlabGroup && settings.mentoringGraderUserId && settings.gitlabCourseProject && settings.gradingProject)
  return { project, waiting }
}
