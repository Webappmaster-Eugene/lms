import type { ComponentProps } from 'react'

export type TutoringWorkChoice = { iid: number; title: string; url: string }
type Props = {
  action: NonNullable<ComponentProps<'form'>['action']>
  works: TutoringWorkChoice[]
  previousUrl?: string | null
  submitLabel?: string
}

const button = 'min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring'
const field = 'min-h-11 min-w-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function HomeworkSubmission({ action, works, previousUrl, submitLabel = 'Сдать работу' }: Props) {
  if (previousUrl) return <form action={action}>
    <input type="hidden" name="submission" value={previousUrl} />
    <button className={button}>Сдать исправление</button>
  </form>

  const manual = <form action={action} className="flex flex-wrap items-end gap-2">
    <label className="grid min-w-0 flex-1 basis-44 gap-1 text-sm">Ссылка на работу
      <input name="submission" type="url" maxLength={1000} required className={field} />
    </label>
    <button className={button}>{works.length ? 'Сдать по ссылке' : submitLabel}</button>
  </form>

  if (!works.length) return manual
  return <div className="space-y-3">
    <form action={action} className="flex flex-wrap items-end gap-3">
      {works.length === 1 ? <div className="min-w-0 flex-1 basis-44">
        <input type="hidden" name="submission" value={works[0].url} />
        <span className="block text-sm">Работа в GitLab</span>
        <a href={works[0].url} target="_blank" rel="noopener noreferrer" className="break-words text-sm font-medium text-primary hover:underline">
          !{works[0].iid} · {works[0].title}
        </a>
      </div> : <label className="grid min-w-0 flex-1 basis-44 gap-1 text-sm">Работа в GitLab
        <select className={field} required name="submission" defaultValue="">
          <option value="" disabled>Выберите работу</option>
          {works.map(work => <option key={work.iid} value={work.url}>!{work.iid} · {work.title}</option>)}
        </select>
      </label>}
      <button className={button}>{submitLabel}</button>
    </form>
    <details>
      <summary className="w-fit cursor-pointer rounded py-2 text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        Указать ссылку вручную
      </summary>
      {manual}
    </details>
  </div>
}
