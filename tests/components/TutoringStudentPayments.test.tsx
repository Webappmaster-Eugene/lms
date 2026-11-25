import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { StudentPayments } from '@/components/tutoring/StudentPayments'
import type { StudentMeetingCharge } from '@/server/tutoring-student-payments'

const charge = (meeting: number, status: StudentMeetingCharge['status'], amountKopecks: number): StudentMeetingCharge => ({
  meeting, status, amountKopecks, id: meeting, participant: 12, minutes: 60, hourlyKopecks: amountKopecks,
  streamId: 5, streamTitle: 'Node.js', canOpenMeeting: true, createdAt: '2026-11-20T09:00:00Z',
})

it('показывает общий остаток и ссылки на каждую неоплаченную встречу, после выпуска история доступна для чтения', () => {
  const charges = [{ ...charge(4, 'due', 50000), canOpenMeeting: false }, charge(3, 'paid', 180000), charge(2, 'due', 150000), charge(1, 'due', 120000)]
  const url = '/tutoring/nodejs/streams/5'
  const view = render(<StudentPayments charges={charges} streamHref={url} />)
  expect(screen.getByRole('heading', { name: /К оплате 3\s200 ₽/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Встреча 1' })).toHaveAttribute('href', url + '?meeting=1#payment')
  expect(screen.getByRole('link', { name: 'Встреча 2' })).toHaveAttribute('href', url + '?meeting=2#payment')
  expect(screen.queryByRole('link', { name: 'Встреча 4' })).toBeNull()
  view.rerender(<StudentPayments charges={charges} />)
  expect(screen.getByText(/Оплачено · 1\s800 ₽/)).toBeInTheDocument()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})
