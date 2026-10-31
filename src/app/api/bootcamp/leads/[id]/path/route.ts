import { parseAdmissionInput, parseDueDays, parseManualPayment, parseMessage } from '@/lib/bootcamp-admission'
import { EnrollmentInputError, parseEnrollmentInput } from '@/lib/bootcamp-enrollment'
import { adminRequest, handleRoute, routeId, routeResponse } from '@/server/bootcamp-enrollment-routes'
import { admitLead, cancelAdmission, decideLead, enrollPaidLead, extendEntryTask, leadPathState, reopenLead, resendPaymentLink } from '@/server/bootcamp-lead-path'
import { markPaidManually } from '@/server/bootcamp-payment'
import { readRequestJson } from '@/server/read-json-body'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/** GET - всё, что показывает панель «Путь заявки». */
export async function GET(request: Request, { params }: Props) {
  return handleRoute('Bootcamp lead path state failed', async () => {
    const { payload } = await adminRequest(request, false)
    return routeResponse(await leadPathState(payload, routeId((await params).id)))
  })
}

/** POST { action, ...поля формы } - кнопки панели. Ответ - новое состояние панели. */
export async function POST(request: Request, { params }: Props) {
  return handleRoute('Bootcamp lead path action failed', async () => {
    const { payload, user } = await adminRequest(request, true)
    const leadId = routeId((await params).id)
    const body = await readRequestJson(request, 8192)
    const action = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).action : undefined
    switch (action) {
      case 'admit': return routeResponse(await admitLead(payload, user, leadId, parseAdmissionInput(body)))
      case 'prepare': return routeResponse(await decideLead(payload, user, leadId, 'preparation', parseMessage(body, true)))
      case 'reject': return routeResponse(await decideLead(payload, user, leadId, 'rejected', parseMessage(body, false)))
      case 'withdraw': return routeResponse(await decideLead(payload, user, leadId, 'withdrawn', parseMessage(body, false)))
      case 'reopen': return routeResponse(await reopenLead(payload, user, leadId))
      case 'extend-entry-task': return routeResponse(await extendEntryTask(payload, user, leadId))
      case 'resend-payment': return routeResponse(await resendPaymentLink(payload, user, leadId, parseDueDays(body)))
      case 'cancel-admission': return routeResponse(await cancelAdmission(payload, user, leadId))
      case 'mark-paid': {
        const { amountKopecks, comment } = parseManualPayment(body)
        await markPaidManually(payload, user, leadId, amountKopecks, comment)
        return routeResponse(await leadPathState(payload, leadId))
      }
      case 'enroll': return routeResponse(await enrollPaidLead(payload, user, leadId, parseEnrollmentInput(body)))
      default: throw new EnrollmentInputError('Неизвестное действие')
    }
  })
}
