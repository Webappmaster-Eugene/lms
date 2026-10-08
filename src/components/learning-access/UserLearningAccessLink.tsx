import Link from 'next/link'
import type { UIFieldServerProps } from 'payload'

export function UserLearningAccessLink({ id, req, data }: UIFieldServerProps) {
  if (req.user?.role !== 'admin' || data.role === 'admin') return null
  if (id === undefined) return <p>Сохраните ученика, чтобы назначить ему обучение.</p>
  return <Link href={`/admin/learning-access?user=${encodeURIComponent(String(id))}`}>Назначить обучение этому ученику</Link>
}
