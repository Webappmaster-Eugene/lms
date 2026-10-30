import type { EnrollmentStepState } from '@/lib/bootcamp-enrollment'

const STATE_LABEL: Record<EnrollmentStepState, string> = { pending: 'ждёт', done: 'готово', skipped: 'пропущено', failed: 'ошибка' }

const formatAt = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(value))

export type StepView = { key: string, label: string, state: EnrollmentStepState, detail?: string, at?: string }

/** Шаги зачисления списком: общий для панели в заявке и карточки зачисления. */
export function EnrollmentSteps({ steps }: { steps: StepView[] }) {
  return (
    <ul className="enrollment__steps" aria-label="Шаги зачисления">
      {steps.map((step) => (
        <li key={step.key}>
          <span className={`enrollment__state enrollment__state--${step.state}`}>{STATE_LABEL[step.state]}</span>
          <span>
            {step.label}
            {(step.detail || step.at) && <span className="enrollment__detail">{[step.detail, step.at ? formatAt(step.at) : null].filter(Boolean).join(', ')}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export { formatAt as formatEnrollmentTime }
