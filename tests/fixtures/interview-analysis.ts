import type { InterviewAnalysisContext, InterviewAnalysisResult } from '@/lib/interviews/analysis-types'

export const interviewContext: InterviewAnalysisContext = {
  direction: 'React.js', targetGrade: 'middle', vacancyText: 'Разрабатывать React-приложения', interviewFormat: 'mixed',
}

// One assessed and one unasked criterion distinguish demonstrated skills from missing evidence.
export const interviewResult: InterviewAnalysisResult = {
  report: {
    candidateSpeaker: 'SPEAKER_01', hrSummary: 'Кандидат объяснил зависимости useEffect, но не обсуждал архитектуру.',
    grade: { level: 'middle', confidence: 'medium', rationale: 'Есть практический опыт React, архитектуру необходимо проверить.' },
    criteria: [
      { criterionId: 'react', score: 4, comment: 'Правильно объясняет очистку эффекта', evidence: [{ quote: 'Возвращаем функцию очистки', timestamp: '00:03:20', verified: true }] },
      { criterionId: 'design', score: null, comment: 'Не обсуждалось', evidence: [] },
    ],
    communication: { clarity: 4, confidence: 3, structure: 4, comment: 'Последовательные ответы' },
    resumeCheck: [], strengths: ['Понимает жизненный цикл эффектов'], risks: [],
    growthAreas: ['Практиковать проектирование'], openQuestions: ['Как выбрать границы модулей?'], limitations: ['Архитектура не обсуждалась'],
  },
  score: { overall: 80, coverage: 0.5, verdict: 'maybe', failedMust: [], uncheckedMust: ['design'], borderline: false },
  criteria: [
    { id: 'react', name: 'React', description: 'Хуки и управление состоянием', kind: 'must', weight: 3 },
    { id: 'design', name: 'Проектирование', description: 'Границы модулей', kind: 'must', weight: 3 },
  ],
  model: 'service-fixture', limitations: ['Недостаточно данных по проектированию'],
}
