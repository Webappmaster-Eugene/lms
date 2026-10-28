import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ErrorReference } from '@/components/errors/ErrorReference'

export type TerminalLine = {
  readonly kind: 'command' | 'error' | 'comment' | 'hint'
  readonly text: ReactNode
}

type ErrorScreenProps = {
  /** Крупный фоновый код: 404, 500. */
  readonly status: string
  readonly eyebrow: string
  readonly title: string
  readonly description: ReactNode
  readonly terminal: readonly TerminalLine[]
  readonly actions: ReactNode
  /** Код для поддержки: digest серверной ошибки или id события Sentry. */
  readonly reference?: string
  readonly tone?: 'neutral' | 'danger'
  /** Внутри экрана входа места меньше: без фоновой цифры и с меньшими отступами. */
  readonly compact?: boolean
}

const LINE_STYLE: Record<TerminalLine['kind'], string> = {
  command: 'text-foreground',
  error: 'text-destructive',
  comment: 'text-muted-foreground',
  hint: 'text-success',
}

export const errorPrimaryAction = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
export const errorSecondaryAction = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * Общий экран ошибок платформы. Окно терминала — не украшение ради украшения:
 * ученики здесь учатся разработке, и сбой, показанный как вывод команды,
 * читается привычнее, чем абстрактная иллюстрация.
 */
export function ErrorScreen({ status, eyebrow, title, description, terminal, actions, reference, tone = 'neutral', compact = false }: ErrorScreenProps) {
  return (
    <section
      aria-labelledby="error-screen-title"
      className={cn('relative isolate mx-auto flex w-full max-w-2xl flex-col items-center text-center', compact ? 'py-4' : 'min-h-[60vh] justify-center py-10 sm:py-14')}
    >
      {!compact && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 select-none text-center font-mono text-[7rem] font-black leading-none tracking-tighter text-foreground/[0.04] sm:top-2 sm:text-[11rem]"
        >
          {status}
        </span>
      )}

      <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', tone === 'danger' ? 'bg-destructive' : 'bg-primary')} />
        {eyebrow}
      </p>
      <h1 id="error-screen-title" className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <div className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</div>

      <div aria-hidden="true" className="mt-7 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-2 truncate font-mono text-xs text-muted-foreground">mentorcareer - zsh</span>
        </div>
        <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6">
          {terminal.map((line, index) => (
            <span key={index} className={cn('block whitespace-pre-wrap break-words', LINE_STYLE[line.kind])}>
              {line.kind === 'command' || line.kind === 'hint' ? <span className="text-muted-foreground">$ </span> : line.kind === 'error' ? '✗ ' : '# '}
              {line.text}
            </span>
          ))}
          <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-foreground/60 motion-reduce:animate-none" />
        </pre>
      </div>

      <div className="mt-7 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:flex-wrap">{actions}</div>

      {reference && <ErrorReference value={reference} />}
    </section>
  )
}
