import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { NotesList } from '@/components/lesson/NotesList'
import { relationKey } from '@/lib/course-lessons'
import type { NoteEntry } from '@/lib/notes'
import { collectAllPages } from '@/lib/paginate'
import { getPayload } from '@/lib/payload'

export const metadata: Metadata = {
  title: 'Мои заметки',
}

export default async function NotesPage() {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/login')

  const notes = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'notes',
        where: { user: { equals: user.id } },
        select: { content: true, lesson: true, updatedAt: true },
        depth: 0,
        sort: ['-updatedAt', 'id'],
        page,
        limit,
      }),
    { label: `заметки пользователя ${user.id}` },
  )

  // Уроки подгружаются отдельно и только опубликованные: снятый урок не должен
  // просочиться ссылкой, а заметка к нему остаётся видна.
  const lessonIds = [...new Set(notes.flatMap((n) => relationKey(n.lesson) ?? []))]
  const lessons =
    lessonIds.length === 0
      ? []
      : await collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'lessons',
              where: { id: { in: lessonIds }, isPublished: { equals: true } },
              select: { title: true, slug: true, course: true },
              depth: 1,
              sort: 'id',
              page,
              limit,
            }),
          { label: `уроки заметок пользователя ${user.id}` },
        )
  const lessonById = new Map(lessons.map((l) => [String(l.id), l]))

  const entries: NoteEntry[] = notes.map((note) => {
    const lesson = lessonById.get(relationKey(note.lesson) ?? '')
    const course = lesson && typeof lesson.course === 'object' && lesson.course?.isPublished ? lesson.course : null
    return {
      id: String(note.id),
      content: note.content,
      updatedAt: note.updatedAt,
      lesson: lesson ? { title: lesson.title, slug: lesson.slug } : null,
      course: course ? { id: String(course.id), title: course.title, slug: course.slug } : null,
    }
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Мои заметки</h1>
        <p className="text-sm text-muted-foreground">Всё, что вы записали по урокам, — в одном месте</p>
      </div>
      <NotesList notes={entries} />
    </div>
  )
}
