import { managementPrimary } from '@/components/content-management/ManagementHeading'
import type { TutoringCheck, TutoringProject } from '@/payload-types'
import { provisionTutoringProject } from '@/server/tutoring-actions'

export function ProjectStatus({ project, enabled = true }: { project: TutoringProject | null; enabled?: boolean }) {
  if (project?.state === 'ready' && project.projectUrl) {
    return <div className="space-y-1">
      <a className="text-sm font-semibold text-primary hover:underline" href={project.projectUrl}
        target="_blank" rel="noopener noreferrer">Открыть учебный проект GitLab</a>
      <p className="break-words text-sm text-muted-foreground">Для входа используйте почту приглашения{project.gitlabEmail && <> ({project.gitlabEmail})</>}. Для новой учётной записи GitLab отправляет на неё ссылку, по которой можно задать пароль.</p>
    </div>
  }
  if (!project && enabled) {
    return <p className="text-sm text-muted-foreground">Здесь появится ссылка на личный проект GitLab. Если ссылки долго нет, попросите наставника проверить выдачу в карточке ученика.</p>
  }
  if (enabled && project && ['queued', 'running', 'revoked', 'revoking', 'revoke_failed'].includes(project.state)) {
    return <p className="text-sm text-muted-foreground">GitLab готовит учебный проект. Обновите страницу чуть позже, здесь появится ссылка.</p>
  }
  return <p className="text-sm text-muted-foreground">Учебный проект пока недоступен</p>
}

export function MentorProject({ stream, participant, project, enabled, inviteEmail }: {
  stream: number; participant: number; project: TutoringProject | null; enabled: boolean; inviteEmail?: string | null
}) {
  const confirmEmail = enabled && !inviteEmail && !project?.gitlabEmail && (!project || project.state === 'failed')
  return <section id="project" className="space-y-2 rounded-xl border border-border bg-card p-4">
    <h3 className="font-semibold">Учебный проект</h3>
    {confirmEmail
      ? <p className="text-sm text-muted-foreground">Участник добавлен до автоматической выдачи. Уточните у ученика, какую почту использовать для входа в GitLab, и подтвердите её здесь.</p>
      : <ProjectStatus project={project} enabled={enabled} />}
    {project?.error && <p className="text-sm text-destructive">{project.error}</p>}
    {enabled && (!project || project.state === 'failed') &&
      <form action={provisionTutoringProject.bind(null, stream, participant)} className="flex flex-wrap items-end gap-3">
        {confirmEmail && <label className="grid min-w-0 gap-1 text-sm">Почта приглашения
          <input className="min-h-11 min-w-0 rounded-md border border-input bg-background px-3 py-2" name="inviteEmail" type="email" required maxLength={254} />
        </label>}
        <button className={managementPrimary}>{confirmEmail ? 'Подтвердить почту и выдать проект' : project ? 'Повторить выдачу проекта' : 'Проверить выдачу проекта'}</button>
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
