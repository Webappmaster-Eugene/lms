import { z } from 'zod'
import type { InterviewAnalysisResult } from '@/lib/interviews/analysis-types'

const text = z.string().max(100000)
const strings = z.array(text).max(100)
const score = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable()
const grades = ['noob', 'intern', 'junior', 'junior_plus', 'junior_plus_plus', 'middle_minus', 'middle', 'middle_plus', 'middle_plus_plus', 'senior', 'senior_plus', 'staff', 'master'] as const
export const analysisContextInputSchema = z.object({
  consent: z.literal(true),
  targetGrade: z.enum(['intern', 'junior', 'middle', 'senior', 'lead']),
  vacancyText: z.string().trim().max(15000).default(''),
  interviewFormat: z.enum(['technical', 'live_coding', 'system_design', 'hr', 'mixed']),
  candidateName: z.string().trim().max(120).optional(),
}).strict()

export const analysisContextSchema = analysisContextInputSchema.omit({ consent: true }).extend({ direction: z.string().trim().min(1).max(100) })

export const analysisResultSchema: z.ZodType<InterviewAnalysisResult> = z.object({
  report: z.object({
    candidateSpeaker: z.string().max(120).nullable(),
    hrSummary: text,
    grade: z.object({ level: z.enum(grades), confidence: z.enum(['low', 'medium', 'high']), rationale: text }).nullable().optional(),
    extraneous: z.array(z.object({ fromSec: z.number().min(0), toSec: z.number().min(0), note: text })).max(100).optional(),
    criteria: z.array(z.object({ criterionId: z.string().max(40), score, comment: text, evidence: z.array(z.object({ quote: text, timestamp: z.string().max(40).nullable(), verified: z.boolean() })).max(100) })).max(30),
    communication: z.object({ clarity: score, confidence: score, structure: score, comment: text }),
    resumeCheck: z.array(z.object({ claim: text, status: z.enum(['confirmed', 'contradicted', 'not_discussed']), note: text })).max(100),
    strengths: strings, risks: z.array(z.object({ title: text, severity: z.enum(['low', 'medium', 'high']), detail: text })).max(100),
    growthAreas: strings, openQuestions: strings, limitations: strings,
  }),
  score: z.object({ overall: z.number().min(0).max(100), coverage: z.number().min(0).max(1), verdict: z.enum(['strong_yes', 'yes', 'maybe', 'no', 'insufficient_data']), failedMust: strings, uncheckedMust: strings, borderline: z.boolean() }),
  criteria: z.array(z.object({ id: z.string().max(40), name: z.string().max(200), description: z.string().max(1000), kind: z.enum(['must', 'nice', 'soft']), weight: z.union([z.literal(1), z.literal(2), z.literal(3)]) })).min(1).max(30),
  model: z.string().max(100), limitations: strings,
}).superRefine((value, ctx) => {
  const ids = new Set(value.criteria.map((criterion) => criterion.id))
  if ([...value.score.failedMust, ...value.score.uncheckedMust].some((id) => !ids.has(id)) || value.report.extraneous?.some((segment) => segment.toSec < segment.fromSec)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Некорректные ссылки на критерии или интервалы записи' })
  if (ids.size !== value.criteria.length || value.report.criteria.length !== ids.size || new Set(value.report.criteria.map((criterion) => criterion.criterionId)).size !== ids.size || value.report.criteria.some((criterion) => !ids.has(criterion.criterionId))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Несогласованные критерии отчёта' })
})
