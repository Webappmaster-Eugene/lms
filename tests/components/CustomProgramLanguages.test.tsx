import { useState } from 'react'
import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomProgramCases } from '@/components/trainer/CustomProgramCases'
import type { RuntimeCase } from '@/lib/trainer/runtime-spec'

function Checks({ language }: { language: 'go' | 'python' }) {
  const [cases, setCases] = useState<RuntimeCase[]>([])
  return <CustomProgramCases language={language} cases={cases} onChange={setCases} disabled={false} />
}

it('свои stdin/stdout проверки подписаны выбранным языком и сохраняются при переключении', async () => {
  const user = userEvent.setup()
  const view = render(<Checks language="python" />)
  await user.click(screen.getByText('Свои проверки Python (0)'))
  await user.click(screen.getByRole('button', { name: 'Добавить проверку Python' }))
  await user.click(screen.getByRole('textbox', { name: 'Ввод Python 1' }))
  await user.paste('[5,-2]')
  await user.type(screen.getByRole('textbox', { name: 'Ожидаемый вывод Python 1' }), '3')
  view.rerender(<Checks language="go" />)
  expect(screen.getByRole('textbox', { name: 'Ввод Go 1' })).toHaveValue('[5,-2]')
  expect(screen.getByRole('textbox', { name: 'Ожидаемый вывод Go 1' })).toHaveValue('3')
  expect(screen.queryByRole('button', { name: 'Добавить проверку Python' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Удалить проверку 1' }))
  expect(screen.getByText('Свои проверки Go (0)')).toBeInTheDocument()
})
