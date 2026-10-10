import { getProfile, updateProfile } from '@/server/profile/account'

export const GET = getProfile
export const PATCH = (request: Request) => updateProfile(request)
