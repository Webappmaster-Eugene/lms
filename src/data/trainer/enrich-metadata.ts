import type { TrainerTaskSeed, TrainerTopicSeed } from './types'
import type { TrainerTag } from '@/lib/trainer/constants'
import type { InterviewFormat } from '@/lib/trainer/metadata'
import { documentedCompanySources } from './company-sources'

const specificTags: Record<string, TrainerTag[]> = {
  'two-sum': ['hash-table'], 'valid-parentheses': ['stack'],
  'contains-duplicate': ['hash-table'], 'best-time-to-buy-sell': ['greedy'],
  'merge-sorted-arrays': ['two-pointers'], 'max-depth-binary-tree': ['tree'],
  'move-zeroes': ['two-pointers'], 'longest-substring': ['sliding-window', 'hash-table'],
  'maximum-subarray': ['dynamic-programming'], 'merge-intervals': ['sorting'],
  'group-anagrams': ['hash-table'], 'three-sum': ['sorting', 'two-pointers'],
  'container-with-most-water': ['two-pointers'], 'generate-parentheses': ['backtracking'],
  'level-order-traversal': ['tree', 'queue'], 'unique-paths': ['dynamic-programming'],
  'trapping-rain-water': ['two-pointers'], 'median-two-sorted-arrays': ['binary-search'],
  'n-queens': ['backtracking'], 'queue': ['queue'], 'linked-list': ['linked-list'],
  'lru-cache': ['hash-table', 'linked-list'], 'binary-search-tree': ['tree'],
  'hash-table': ['hash-table'], 'trie': ['tree'], 'binary-search': ['binary-search'],
  'quick-sort': ['sorting'], 'merge-sort': ['sorting'], 'graph-bfs': ['graph', 'queue'],
  'graph-dfs': ['graph'], 'fibonacci-memo': ['dynamic-programming'],
  'parallel-limit': ['concurrency'], 'fetch-with-timeout': ['cancelation'],
}

function formatFor(topic: TrainerTopicSeed, task: TrainerTaskSeed): InterviewFormat {
  if (task.checkMode === 'types') return 'type-system'
  if (task.checkMode === 'dom') return 'frontend'
  if (topic.category === 'algorithms' || topic.category === 'leetcode') return 'algorithms'
  return topic.slug === 'js-core' ? 'language' : 'livecoding'
}

function defaultTags(topic: TrainerTopicSeed, task: TrainerTaskSeed): TrainerTag[] {
  if (task.languages.includes('python')) return ['python', 'algorithms']
  if (task.languages.includes('go')) return ['go', 'arrays']
  if (task.languages.includes('react')) return ['react', 'state']
  if (task.checkMode === 'dom') return ['web-api', 'accessibility']
  if (task.checkMode === 'types') return ['type-level']
  return topic.category === 'algorithms' || topic.category === 'leetcode' ? ['algorithms'] : ['livecoding']
}

/** Preserve the original objects; enrichment never touches tests, solutions or identities. */
export function enrichTrainerMetadata(topic: TrainerTopicSeed): TrainerTopicSeed {
  return {
    ...topic,
    tasks: topic.tasks.map((task) => {
      const sources = documentedCompanySources(task)
      const companies = [...new Set([...(task.companies ?? []), ...sources.map((row) => row.company)])]
      return {
        ...task,
        companies,
        tags: [...new Set([...(task.tags?.length ? task.tags : defaultTags(topic, task)), ...(specificTags[task.slug] ?? [])])],
        interviewFormat: task.interviewFormat ?? formatFor(topic, task),
        recommendedMinutes: task.recommendedMinutes ?? ({ easy: 15, medium: 30, hard: 45 }[task.difficulty]),
        companyEvidence: companies.map((company) => task.companyEvidence?.find((row) => row.company === company) ?? sources.find((row) => row.company === company) ?? {
          company, kind: 'unverified' as const, checkedAt: '2026-10-10',
          note: 'Историческая метка каталога. Публичное подтверждение этой задачи на собеседовании компании пока не найдено; частота неизвестна.',
        }),
      }
    }),
  }
}
