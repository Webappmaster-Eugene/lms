import type { EmailBroadcast } from '@/payload-types'

const STATUS: Record<EmailBroadcast['status'], { label: string; className: string }> = {
  draft: { label: 'Черновик', className: 'bg-secondary text-muted-foreground' },
  sending: { label: 'Отправляется', className: 'bg-info/10 text-info' },
  sent: { label: 'Отправлена', className: 'bg-success/10 text-success' },
  cancelled: { label: 'Остановлена', className: 'bg-warning/10 text-warning' },
  failed: { label: 'Не доставлена', className: 'bg-destructive/10 text-destructive' },
}

export function BroadcastStatusBadge({ status }: { status: EmailBroadcast['status'] }) {
  const { label, className } = STATUS[status]
  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-medium ${className}`}>{label}</span>
}

export function audienceLabel(broadcast: Pick<EmailBroadcast, 'audience' | 'recipients'>): string {
  if (broadcast.audience === 'all') return 'Все активные ученики'
  const count = broadcast.recipients?.length ?? 0
  return `Выбранные ученики: ${count}`
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })

export function broadcastDate(value: string | null | undefined): string {
  return value ? `${dateFormat.format(new Date(value))} мск` : '-'
}
