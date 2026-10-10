export type LearningHistoryEntry = {
  lessonId: number
  title: string
  courseId: number
  course: string
  courseSlug: string
  href: string
  lastViewedAt: string
  videoTitle?: string
  seconds?: number
  ended?: boolean
  isCompleted: boolean
}

export type LearningHistoryPage = {
  docs: LearningHistoryEntry[]
  page: number
  totalDocs: number
  hasNextPage: boolean
}
