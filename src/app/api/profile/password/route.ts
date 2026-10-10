import { updateProfile } from '@/server/profile/account'

export const POST = (request: Request) => updateProfile(request, true)
