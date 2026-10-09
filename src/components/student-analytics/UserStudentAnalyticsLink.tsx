import Link from 'next/link'
import type { UIFieldServerProps } from 'payload'

export function UserStudentAnalyticsLink({ id, req }: UIFieldServerProps) {
  if (req.user?.role !== 'admin' || id === undefined) return null
  return <Link href={`/admin/student-analytics?user=${encodeURIComponent(String(id))}`}>Посмотреть активность этого пользователя</Link>
}
