import { expect, test } from '@playwright/test'

/** Без входа: доступность, закрытые страницы, редиректы, заголовки безопасности, лендинг. */
test.use({ storageState: { cookies: [], origins: [] } })

test('сервис жив, страница входа открывается', async ({ page, request }) => {
  expect((await request.get('/api/health')).status()).toBe(200)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Войти/ })).toBeVisible()
})

for (const path of ['/', '/courses', '/notes', '/questions', '/profile', '/certificates']) {
  test(`${path} без входа уводит на вход с возвратом`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    expect(response.headers().location).toContain(`/login?redirect=${encodeURIComponent(path)}`)
  })
}

for (const path of ['/admin/questions', '/admin/import-yandex']) {
  test(`${path} без входа — настоящий редирект, а не страница с кодом 200`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    expect(new URL(response.headers().location ?? '', 'https://x').pathname).toBe('/')
  })
}

test('заголовки безопасности на месте', async ({ request }) => {
  const headers = (await request.get('/login')).headers()
  expect(headers['content-security-policy']).toContain("connect-src 'self'")
  expect(headers['x-frame-options']).toBeTruthy()
  expect(headers['referrer-policy']).toBeTruthy()
})

test('лендинг отвечает, несуществующая страница лендинга — 404', async ({ request }) => {
  expect((await request.get('https://promo.mentorcareer.ru/')).status()).toBe(200)
  expect((await request.get('https://promo.mentorcareer.ru/net-takoy-stranicy')).status()).toBe(404)
})
