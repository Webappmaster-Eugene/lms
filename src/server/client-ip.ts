import { BlockList, isIP } from 'node:net'

/** Сети прокси между интернетом и приложением: туннель VDS → дом, Docker, libvirt, loopback. */
const PROXY_NETWORKS = new BlockList()
for (const [network, prefix] of [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8], ['100.64.0.0', 10], ['169.254.0.0', 16]] as const) {
  PROXY_NETWORKS.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) {
  PROXY_NETWORKS.addSubnet(network, prefix, 'ipv6')
}

/**
 * Адрес клиента из X-Forwarded-For. Каждый Traefik дописывает своего соседа: на VDS —
 * клиента, в домашней VM — туннельный адрес VDS (10.77.0.1). Поэтому клиент — первый
 * справа адрес не из внутренних сетей; то, что прислал сам клиент, левее и не берётся.
 */
export function trustedClientIp(headers: Headers): string | null {
  if (process.env.LMS_TRUST_PROXY !== 'true') return null
  const forwarded = headers.get('x-forwarded-for')
  if (!forwarded || forwarded.length > 1024) return null
  const chain = forwarded.split(',').map((entry) => entry.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, ''))
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const ip = chain[index] ?? ''
    const family = isIP(ip)
    if (family === 0) return null
    if (!PROXY_NETWORKS.check(ip, family === 6 ? 'ipv6' : 'ipv4')) return ip
  }
  return null
}
