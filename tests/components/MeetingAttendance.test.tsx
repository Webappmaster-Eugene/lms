import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { MeetingAttendance } from '@/components/tutoring/MeetingAttendance'
import { MentorMeetingPayment } from '@/components/tutoring/MeetingPayment'
import type { TutoringParticipant, TutoringStream } from '@/payload-types'

vi.mock('@/server/tutoring-actions', () => ({ completeTutoringMeeting: vi.fn(), recordTutoringCharge: vi.fn() }))
vi.mock('@/server/tutoring', () => ({ tutoringStudentName: (m: TutoringParticipant) => `Ученик ${m.id}` }))

const date = '2026-11-17T09:00:00Z'
const stream: TutoringStream = { id: 2, title: 'Node.js', program: 'nodejs', status: 'active', currentMeeting: 1,
  hourlyKopecks: 150000, startsAt: date, updatedAt: date, createdAt: date }
const member = (id: number, currentMeeting: number): TutoringParticipant => ({
  id, student: id + 100, stream: stream.id, active: true, currentMeeting, updatedAt: date, createdAt: date,
})

it('автоматически выбирает ученика только в индивидуальном потоке, а не последнего оставшегося в групповом', async () => {
  const first = member(10, 1)
  const { rerender } = render(<MeetingAttendance stream={stream} meeting={1} members={[first]} attended={new Set()} started />)
  expect(screen.getByRole('checkbox', { name: 'Ученик 10' })).toBeChecked()
  rerender(<MeetingAttendance key="group" stream={stream} meeting={1} members={[first, member(20, 2)]} attended={new Set([20])} started />)
  const checkbox = screen.getByRole('checkbox', { name: 'Ученик 10' })
  expect(checkbox).not.toBeChecked()
  expect(screen.queryByRole('checkbox', { name: 'Ученик 20' })).not.toBeInTheDocument()
  await userEvent.click(checkbox)
  const form = screen.getByRole('button', { name: 'Завершить встречу' }).closest('form')
  if (!form) throw new Error('Пропала форма завершения')
  const data = new FormData(form)
  expect(data.getAll('participant')).toEqual(['10'])
  expect(data.get('minutes')).toBe('120')
})

it('дает отметить полученный перевод без полей расчета и сохраняет версию открытого счета', () => {
  render(<MentorMeetingPayment stream={2} participant={10} meeting={1} charge={{ id: 5, participant: 10, meeting: 1,
    minutes: 75, hourlyKopecks: 150000, amountKopecks: 187500, status: 'due', updatedBy: 1, updatedAt: date, createdAt: date }} />)
  const button = screen.getByRole('button', { name: 'Отметить оплату' })
  const form = button.closest('form')
  if (!form) throw new Error('Пропала форма получения перевода')
  expect(button).toHaveAttribute('value', 'paid')
  const data = new FormData(form)
  expect(data.get('revision')).toBe(date)
  expect(data.has('minutes')).toBe(false)
  expect(data.has('rate')).toBe(false)
})
