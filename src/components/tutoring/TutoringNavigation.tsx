'use client'

import { usePathname } from 'next/navigation'
import { BootcampTabs } from '@/components/tutoring/BootcampTabs'

export function TutoringNavigation({ base }: { base: string }) {
  const path = usePathname()
  const streams = `${base}/streams`
  const inStreams = path === streams || path.startsWith(`${streams}/`)
  return <BootcampTabs label="Репетиторство" items={[
    { href: base, label: 'Лекции', active: !inStreams },
    { href: streams, label: 'Потоки', active: inStreams },
  ]} />
}
