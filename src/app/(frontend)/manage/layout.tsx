import { requireContentAdmin } from '@/lib/content-management/pages'

export default async function ContentManagementLayout({ children }: { children: React.ReactNode }) {
  await requireContentAdmin()
  return <div className="mx-auto max-w-5xl space-y-6">{children}</div>
}
