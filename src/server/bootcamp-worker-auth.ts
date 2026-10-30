import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Ключи исполнителя зачислений (VM GitLab) и вебхуков GitLab выводятся из PAYLOAD_SECRET,
 * как ключ планировщика уведомлений: новых переменных в Dokploy не нужно. Смена
 * PAYLOAD_SECRET меняет оба ключа, их тогда заново кладут в VM GitLab (docs/bootcamp-enrollment.md).
 */
function derive(label: string): Buffer | null {
  const secret = process.env.PAYLOAD_SECRET
  return secret ? createHmac('sha256', secret).update(label).digest() : null
}

function matches(label: string, value: string | null): boolean {
  const expected = derive(label)
  if (!expected || !value || !/^[a-f0-9]{64}$/.test(value)) return false
  return timingSafeEqual(expected, Buffer.from(value, 'hex'))
}

const WORKER = 'lms-bootcamp-enroll-worker-v1'
const WEBHOOK = 'lms-gitlab-webhook-v1'

export const validWorkerKey = (value: string | null) => matches(WORKER, value)
export const validGitlabWebhookToken = (value: string | null) => matches(WEBHOOK, value)

/** Токен вебхука исполнитель получает вместе с заданием и ставит в проект ученика. */
export function gitlabWebhookToken(): string | null {
  return derive(WEBHOOK)?.toString('hex') ?? null
}
