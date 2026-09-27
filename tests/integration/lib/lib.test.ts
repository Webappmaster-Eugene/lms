import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { readSiteContacts } from '@/lib/site-settings'
import { createTopic, getTestPayload, uid } from '../helpers/payload'

/**
 * Утилиты из src/lib, которые ходят в Payload: на настоящей базе, а не на моках.
 */
let payload: Payload

beforeAll(async () => {
  payload = await getTestPayload()
})

describe('collectAllPages', () => {
  it('собирает все документы за пределами первой сотни, без дублей и пропусков', async () => {
    const topic = await createTopic(payload)
    const marker = uid('page')
    const created: number[] = []
    for (let i = 0; i < 230; i += 1) {
      const doc = await payload.create({
        collection: 'trainer-tasks',
        data: { title: `${marker} ${i}`, slug: `${marker}-${i}`, topic: topic.id, starterCode: '//' } as never,
      })
      created.push(doc.id)
    }
    const all = await collectAllPages(
      ({ page, limit }) =>
        payload.find({ collection: 'trainer-tasks', where: { topic: { equals: topic.id } }, sort: 'id', depth: 0, page, limit }),
      { label: 'задачи темы' },
    )
    expect(all.map((d) => d.id)).toEqual(created)
  })
})

describe('readSiteContacts', () => {
  it('отдаёт контакты из глобала site-settings', async () => {
    const before = await payload.findGlobal({ slug: 'site-settings' })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { contacts: { telegramChannel: 'https://t.me/lms_test', email: 'help@lms.test' } },
    })
    try {
      expect(await readSiteContacts()).toMatchObject({ telegramChannel: 'https://t.me/lms_test', email: 'help@lms.test' })
    } finally {
      await payload.updateGlobal({ slug: 'site-settings', data: { contacts: before.contacts } })
    }
  })
})
