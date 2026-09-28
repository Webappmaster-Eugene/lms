import { expect, test as setup } from '@playwright/test'

import { ACCOUNTS, stateOf, type Role } from './env'

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  setup(`вход на прод: ${role}`, async ({ request }) => {
    const response = await request.post('/api/users/login', { data: ACCOUNTS[role] })
    expect(response.status()).toBe(200)
    await request.storageState({ path: stateOf(role) })
  })
}
