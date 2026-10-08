// Imported by Payload's notification hook as well as server routes; never import into a client.
import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import webPush from 'web-push'
import { pushEndpoint } from '@/lib/notification-policy'

export function vapidConfiguration() {
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY
  const subject = process.env.PUSH_VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) return null
  try {
    if (Buffer.from(publicKey, 'base64url').length !== 65 || Buffer.from(privateKey, 'base64url').length !== 32) return null
  } catch { return null }
  return { publicKey, privateKey, subject }
}

export function publicPushAddress(address: string): boolean {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address)
  if (isIP(address) !== 4) return false
  const [a, b] = address.split('.').map(Number)
  return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0 || b === 2)) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19 || b === 51)) && !(a === 203 && b === 0)
}

export async function sendEncryptedPush(subscription: { endpoint: string; p256dh: string; auth: string }, message: { title: string; body: string; url: string; tag: string }): Promise<number> {
  const endpoint = pushEndpoint(subscription.endpoint)
  const config = vapidConfiguration()
  if (!endpoint || !config) return 400
  // The verified DNS answer is pinned into HTTPS lookup, so it cannot change between checks and connect.
  const addresses = await Promise.race([
    lookup(endpoint.hostname, { all: true }),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('Push DNS timeout')), 5000).unref()),
  ])
  if (!addresses.length || addresses.some((entry) => !publicPushAddress(entry.address))) return 400
  const address = addresses[0]
  if (!address) return 400
  const details = webPush.generateRequestDetails({ endpoint: endpoint.href, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: message.title.slice(0, 120), message: message.body.slice(0, 500), link: message.url, tag: message.tag }), { vapidDetails: config, contentEncoding: 'aes128gcm', TTL: 3600, urgency: 'normal', topic: message.tag })
  return new Promise<number>((resolve, reject) => {
    const outgoing = request(endpoint, {
      method: 'POST', headers: details.headers, signal: AbortSignal.timeout(5000),
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address])
        else callback(null, address.address, address.family)
      },
    }, (response) => { const status = response.statusCode ?? 0; response.destroy(); resolve(status) })
    outgoing.once('error', reject)
    outgoing.end(details.body)
  })
}
