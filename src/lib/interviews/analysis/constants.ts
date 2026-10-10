import type { InterviewGrade } from '@/lib/interviews/analysis/types'
export const MAX_INTERVIEW_CRITERIA = 15
export const INTERVIEW_GRADES: readonly { value: InterviewGrade; label: string }[] = [
  { value: 'noob', label: 'noob' },
  { value: 'intern', label: 'intern' },
  { value: 'junior', label: 'junior' },
  { value: 'junior_plus', label: 'junior+' },
  { value: 'junior_plus_plus', label: 'junior++' },
  { value: 'middle_minus', label: 'middle-' },
  { value: 'middle', label: 'middle' },
  { value: 'middle_plus', label: 'middle+' },
  { value: 'middle_plus_plus', label: 'middle++' },
  { value: 'senior', label: 'senior' },
  { value: 'senior_plus', label: 'senior+' },
  { value: 'staff', label: 'staff' },
  { value: 'master', label: 'master' },
]
