import { managementPrimary } from '@/components/content-management/ManagementHeading'
import type { TutoringCheck, TutoringProject } from '@/payload-types'
import { provisionTutoringProject } from '@/server/tutoring-actions'

export function ProjectStatus({ project }: { project: TutoringProject | null }) {
  if (project?.state === 'ready' && project.projectUrl) {
    return <a className="text-sm font-semibold text-primary hover:underline" href={project.projectUrl}
      target="_blank" rel="noopener noreferrer">Открыть учебный проект GitLab</a>
  }
  const text = project?.state === 'queued' || project?.state === 'running'
    ? 'Учебный проект создаётся' : 'Учебный проект пока недоступен'
  return <p className="text-sm text-muted-foreground">{text}</p>
}

export function MentorProject({ stream, participant, project, enabled }: {
  stream: number; participant: number; project: TutoringProject | null; enabled: boolean
}) {
  return <section id="project" className="space-y-2 rounded-xl border border-border bg-card p-4">
    <h3 className="font-semibold">Учебный проект</h3>
    <ProjectStatus project={project} />
    {project?.error && <p className="text-sm text-destructive">{project.error}</p>}
    {enabled && (!project || ['failed', 'revoked', 'revoke_failed'].includes(project.state)) &&
      <form action={provisionTutoringProject.bind(null, stream, participant)} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Логин GitLab
          <input name="username" maxLength={60} defaultValue={project?.username ?? ''} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </label>
        <button className={managementPrimary}>{project ? 'Повторить выдачу проекта' : 'Открыть учебный проект'}</button>
      </form>}
  </section>
}

export function ProjectCheck({ check }: { check: TutoringCheck }) {
  if (check.verdict === 'pending') return <p className="text-sm">Новая версия работы ожидает автопроверки</p>
  const status = check.verdict === 'passed' ? 'пройдена' : check.verdict === 'failed' ? 'есть ошибки' : 'требует внимания'
  return <p className="text-sm">Автопроверка этапа {check.stage}: <strong>{status}</strong>
    {check.total != null && check.passed != null && <> · {check.passed} из {check.total}</>}
  </p>
}
