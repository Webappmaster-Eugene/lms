import { handleRoute, routeResponse } from '@/server/bootcamp-enrollment-routes'
import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { getPayload } from '@/lib/payload'
import { startCheckout } from '@/server/bootcamp-payment'
import { foreignPage } from '@/server/foreign-page'
import { readRequestJson } from '@/server/read-json-body'
import { createRateLimiter } from '@/server/trainer/rate-limit'

export const dynamic = 'force-dynamic'

// Страница открыта по ссылке без входа: предел не даёт наплодить тысячи счетов.
const perLink = createRateLimiter('bootcamp-checkout-link', 10, 10 * 60_000)
const overall = createRateLimiter('bootcamp-checkout-all', 200, 10 * 60_000)

type Props = { params: Promise<{ token: string }> }

/** POST { acceptOffer: true } - «Перейти к оплате»: ответ { url } страницы Робокассы. */
export async function POST(request: Request, { params }: Props) {
  return handleRoute('Bootcamp checkout failed', async () => {
    if (foreignPage(request.headers)) throw new EnrollmentInputError('Оплата доступна только со страницы оплаты', 403)
    const { token } = await params
    if (!perLink.take(token) || !overall.take('all')) throw new EnrollmentInputError('Слишком много попыток. Подождите несколько минут и попробуйте снова.', 429)
    const body = await readRequestJson(request, 1024)
    const acceptOffer = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).acceptOffer : undefined
    return routeResponse({ url: await startCheckout(await getPayload(), token, acceptOffer) })
  })
}
