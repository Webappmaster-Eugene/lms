'use client'

import { useAuth } from '@payloadcms/ui'
import type { User } from '@/payload-types'
import { StudentActivityBridge } from './StudentActivityBridge'

export function AdminActivityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth<User>()
  return <>{user && <StudentActivityBridge userId={user.id} />}{children}</>
}
