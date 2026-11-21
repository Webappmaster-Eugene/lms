import { safeRedirectPath } from '@/lib/safe-redirect'

export const ADMIN_RETURN_PATH_HEADER = 'x-lms-admin-return-path'

export function adminLoginHref(headers: Pick<Headers, 'get'>, loginPath: '/admin/login' | '/login'): string {
  const path = safeRedirectPath(headers.get(ADMIN_RETURN_PATH_HEADER), '')
  if (!path.startsWith('/admin/')) return loginPath

  return `${loginPath}?${new URLSearchParams({ redirect: path })}`
}
