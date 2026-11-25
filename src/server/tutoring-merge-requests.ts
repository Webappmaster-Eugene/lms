import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import { weekFromBranch } from '@/lib/bootcamp-progress'
import type { TutoringMergeRequest, TutoringProject } from '@/payload-types'

type Attributes = Record<string, unknown>

export function gitlabCommit(value: unknown): string | null {
  return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value) ? value.toLowerCase() : null
}

export function mergeRequestHead(attributes: Attributes) {
  const commit = attributes.last_commit
  return commit && typeof commit === 'object' && 'id' in commit ? gitlabCommit(commit.id) : null
}

export async function tutoringMergeRequestSnapshot(payload: Payload, req: PayloadRequest, project: number, mrIid: number) {
  const { docs } = await payload.find({
    collection: 'tutoring-merge-requests', req, depth: 0, limit: 1, overrideAccess: true,
    where: { and: [{ project: { equals: project } }, { mrIid: { equals: mrIid } }] },
  })
  return docs[0] ?? null
}

// Вызывается под блокировкой проекта, после проверки адреса MR и номера проекта в событии.
export async function updateTutoringMergeRequest(payload: Payload, req: PayloadRequest, project: TutoringProject,
  iid: number, attributes: Attributes, eventAt: string, old: TutoringMergeRequest | null) {
  if (!project.gitlabUserId || attributes.author_id !== project.gitlabUserId ||
      attributes.source_project_id !== project.projectId || attributes.target_project_id !== project.projectId) return false
  const branch = typeof attributes.source_branch === 'string' ? attributes.source_branch : ''
  const stage = branch === 'week-00' ? 0 : weekFromBranch(branch)
  if (stage === null || typeof attributes.title !== 'string' || !attributes.title.trim() ||
      !['opened', 'closed', 'merged', 'locked'].includes(String(attributes.state))) return false

  const isOpen = attributes.target_branch === 'main' && attributes.state === 'opened' &&
    attributes.draft !== true && attributes.work_in_progress !== true
  const headSha = mergeRequestHead(attributes)
  const title = attributes.title.trim().slice(0, 255)
  if (old && old.eventAt > eventAt) return false
  if (old && old.eventAt === eventAt) {
    // GitLab может прислать несколько коммитов за одну секунду. Продолжение отличаем от повтора по родительскому коммиту.
    const followsHead = old.isOpen && typeof old.headSha === 'string' && headSha !== null &&
      headSha !== old.headSha && gitlabCommit(attributes.oldrev) === old.headSha
    if (!old.isOpen || (isOpen && !followsHead)) return false
  }

  const data = { project: project.id, mrIid: iid, stage, title, isOpen, headSha, eventAt }
  if (old) await payload.update({ collection: 'tutoring-merge-requests', id: old.id, req, overrideAccess: true, data })
  else await payload.create({ collection: 'tutoring-merge-requests', req, overrideAccess: true, data })
  return true
}

export async function tutoringWorkChoices(payload: Payload, req: PayloadRequest, project: TutoringProject, stage: number) {
  const studentId = typeof project.student === 'number' ? project.student : project.student.id
  if (!req.user || req.user.id !== studentId || project.state !== 'ready' || !project.projectUrl) return []
  const base = project.projectUrl.replace(/\/$/, '') + '/-/merge_requests/'
  const { docs } = await payload.find({
    collection: 'tutoring-merge-requests', req, depth: 0, limit: 12, overrideAccess: true, sort: '-eventAt',
    select: { title: true, mrIid: true },
    where: { and: [{ project: { equals: project.id } }, { stage: { equals: stage } }, { isOpen: { equals: true } }] },
  })
  return docs.map(row => ({ iid: row.mrIid, title: row.title, url: base + row.mrIid }))
}
