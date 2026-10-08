import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import { validateStudentAvatar } from '@/payload/hooks/validateStudentAvatar'
import { clearAuthoritativeLearningMode } from '@/server/learning-access-policy'

const findByID = vi.fn()
const user = { id: 1, role: 'student' }
const find = vi.fn(async () => ({ docs: [{ role: 'student', mode: 'assigned' }] }))
const req = { user, payload: { findByID, find }, t: (key: string) => key } as unknown as PayloadRequest
function change(avatar: unknown, originalAvatar: unknown = null, originalUser = 1) {
  return validateStudentAvatar({ req, data: { avatar }, originalDoc: { id: originalUser, avatar: originalAvatar }, operation: 'update', context: {}, collection: { slug: 'users' } } as unknown as Parameters<typeof validateStudentAvatar>[0])
}
beforeEach(() => { clearAuthoritativeLearningMode(req); user.role = 'student'; findByID.mockReset(); findByID.mockResolvedValue({ id: 42, uploadedBy: 1, mimeType: 'image/png', filesize: 2048 }) })

describe('student avatar publishing boundary', () => {
  it('allows its own verified raster upload', async () => {
    expect(await change(42)).toEqual({ avatar: 42 })
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'media', id: 42, overrideAccess: true }))
  })
  it.each([
    { uploadedBy: 2, mimeType: 'image/png', filesize: 2048 },
    { uploadedBy: null, mimeType: 'image/png', filesize: 2048 },
    { uploadedBy: 1, mimeType: 'image/svg+xml', filesize: 2048 },
    { uploadedBy: 1, mimeType: 'video/mp4', filesize: 2048 },
    { uploadedBy: 1, mimeType: 'image/png', filesize: 2097153 },
    { uploadedBy: 1, mimeType: 'image/png', filesize: -1 },
    { uploadedBy: 1, mimeType: 'image/png', filesize: Number.NaN },
  ])('rejects an unsafe asset before publication: %o', async (media) => {
    findByID.mockResolvedValue(media)
    await expect(change(42)).rejects.toMatchObject({ status: 403 })
  })
  it('permits removing or retaining an unchanged legacy avatar', async () => {
    expect(await change(null, 42)).toEqual({ avatar: null })
    expect(await change({ id: 42 }, 42)).toEqual({ avatar: { id: 42 } })
    expect(findByID).not.toHaveBeenCalled()
  })
  it('rejects publishing for another account even before asset lookup', async () => {
    await expect(change(42, null, 2)).rejects.toMatchObject({ status: 403 })
    expect(findByID).not.toHaveBeenCalled()
  })
  it('stale admin DTO cannot publish another account private asset after demotion', async () => {
    user.role = 'admin'
    findByID.mockResolvedValue({ id: 42, uploadedBy: 2, mimeType: 'image/png', filesize: 2048 })
    await expect(change(42)).rejects.toMatchObject({ status: 403 })
  })
})
