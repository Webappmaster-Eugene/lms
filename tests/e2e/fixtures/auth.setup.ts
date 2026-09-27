import { expect, test as setup } from '@playwright/test'

import { USERS } from './data'
import { storageStateOf, type Role } from './env'

/**
 * Логин через REST один раз на прогон: сохранённые cookie переиспользуют все
 * тесты. UI-логин отдельно проверяет specs/auth.spec.ts.
 */
for (const role of Object.keys(USERS) as Role[]) {
  setup(`вход: ${role}`, async ({ request }) => {
    const { email, password } = USERS[role]
    const response = await request.post('/api/users/login', { data: { email, password } })
    expect(response.status(), await response.text()).toBe(200)
    await request.storageState({ path: storageStateOf(role) })
  })
}
