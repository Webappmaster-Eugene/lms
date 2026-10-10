import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { getPayload } from '@/lib/payload'
import { getTrainerAccess } from '@/server/trainer-access'

/** React cache действует только внутри запроса: metadata и страница делят чтение. */
export const getTrainerTaskPage = cache(async (topicSlug: string, taskSlug: string) => {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  const scope = await getTrainerAccess(payload, user)
  const topics = await payload.find({
    collection: 'trainer-topics', depth: 0,
    where: { slug: { equals: topicSlug }, isPublished: { equals: true }, ...(scope.admin ? {} : { id: { in: scope.browseTopicIds.length ? scope.browseTopicIds : [-1] } }) },
    limit: 1,
  })
  const topic = topics.docs[0]
  if (!topic) return null
  const tasks = await payload.find({
    collection: 'trainer-tasks', depth: 0,
    where: { slug: { equals: taskSlug }, topic: { equals: topic.id }, isPublished: { equals: true }, ...(scope.admin ? {} : { id: { in: scope.accessibleTaskIds.length ? scope.accessibleTaskIds : [-1] } }) },
    limit: 1,
  })
  const task = tasks.docs[0]
  return task ? { payload, user, scope, topic, task } : null
})
