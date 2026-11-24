import type { TutoringParticipant, TutoringProject } from '@/payload-types'
import { submitIntroductionWork } from '@/server/tutoring-actions'

import { ProjectStatus } from './ProjectStatus'

export function IntroPractice({ stream, participant, project }: {
  stream: number; participant: TutoringParticipant; project: TutoringProject | null
}) {
  return <section id={`intro-practice-${stream}`} className="min-w-0 space-y-3 rounded-xl border border-border p-4">
    <h2 className="font-semibold">Пробная сдача</h2>
    <ProjectStatus project={project} />
    {participant.introSubmissionUrl && <a className="block break-all text-primary hover:underline" href={participant.introSubmissionUrl}
      target="_blank" rel="noopener noreferrer">Открыть пробную работу</a>}
    {project?.state === 'ready' && <form action={submitIntroductionWork.bind(null, stream)} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="previous" value={participant.introSubmissionUrl ?? ''} />
      <label className="grid min-w-0 flex-1 basis-56 gap-1 text-sm">Ссылка на запрос на слияние в GitLab
        <input className="min-h-11 min-w-0 rounded-md border border-input bg-background px-3" name="submission" type="url"
          maxLength={1000} required defaultValue={participant.introSubmissionUrl ?? ''} />
      </label>
      <button className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Отправить пробную работу</button>
    </form>}
  </section>
}
