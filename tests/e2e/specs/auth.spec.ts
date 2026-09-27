import { expect, test } from '@playwright/test'

import { USERS } from '../fixtures/data'
import { query, resetTokenOf } from '../fixtures/db'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * Вход, выход, защищённые страницы, восстановление пароля и «регистрация» —
 * в LMS аккаунты заводит админ, студент задаёт пароль по ссылке из письма.
 */
const PROTECTED = ['/', '/courses', '/lessons/e2e-html', '/trainer', '/roadmaps', '/leaderboard', '/profile', '/help', '/certificates']

test.describe('аноним', () => {
  for (const path of PROTECTED) {
    test(`${path} → редирект на /login с возвратом`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === path)
      await expect(page.getByRole('heading', { name: 'MentorCareer LMS' })).toBeVisible()
    })
  }

  test('публичные страницы открываются без входа', async ({ page }) => {
    for (const path of ['/login', '/forgot-password', '/reset-password']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page).toHaveURL(new RegExp(`${path}$`))
    }
  })

  test('подделанная cookie не пускает внутрь: страница без данных пользователя', async ({ page, context }) => {
    await context.addCookies([{ name: 'payload-token', value: 'forged.jwt.token', url: APP_URL }])
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: `${USERS.student.firstName} ${USERS.student.lastName}` })).toHaveCount(0)
  })
})

test.describe('вход и выход через интерфейс', () => {
  test('неверный пароль — понятная ошибка, остаёмся на странице входа', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(USERS.student.email)
    await page.getByLabel('Пароль').fill('wrong-password')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByText('The email or password provided is incorrect.').or(page.getByText(/Неверн/))).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('верный пароль — возврат на запрошенную страницу, «Выйти» закрывает доступ', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fleaderboard/)
    await page.getByLabel('Email').fill(USERS.student.email)
    await page.getByLabel('Пароль').fill(USERS.student.password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/\/leaderboard$/)
    await expect(page.getByRole('heading', { name: 'Лидерборд' })).toBeVisible()

    await page.getByRole('button', { name: 'Выйти' }).first().click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fprofile/)
  })

  test('cookie сессии: HttpOnly и SameSite=Lax', async ({ page, context }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(USERS.student.email)
    await page.getByLabel('Пароль').fill(USERS.student.password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
    const cookie = (await context.cookies()).find((c) => c.name === 'payload-token')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
  })

  test.fail('БАГ: redirect после входа не уводит на внешний сайт (open redirect)', async ({ page }) => {
    await page.route('https://evil.example/**', (route) => route.fulfill({ status: 200, body: 'phishing' }))
    await page.goto('/login?redirect=https://evil.example/steal')
    await page.getByLabel('Email').fill(USERS.student.email)
    await page.getByLabel('Пароль').fill(USERS.student.password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await page.waitForLoadState('networkidle')
    expect(new URL(page.url()).hostname).not.toBe('evil.example')
  })
})

test.describe('восстановление пароля', () => {
  test('форма «Забыли пароль?» не раскрывает, есть ли такой email', async ({ page }) => {
    for (const email of [USERS.leader.email, 'nobody@lms.test']) {
      await page.goto('/login')
      await page.getByRole('link', { name: 'Забыли пароль?' }).click()
      await expect(page).toHaveURL(/\/forgot-password$/)
      await page.getByLabel('Email').fill(email)
      await page.getByRole('button', { name: 'Отправить ссылку' }).click()
      await expect(page.getByText(`Письмо отправлено на ${email}`)).toBeVisible()
    }
  })

  test('сброс с неверным токеном — ошибка, с несовпадающими паролями — ошибка до запроса', async ({ page }) => {
    await page.goto('/reset-password?token=garbage')
    await page.locator('#password').fill('Short1')
    await page.locator('#confirm').fill('Other12')
    await page.getByRole('button').last().click()
    await expect(page.getByText('Пароли не совпадают')).toBeVisible()
    await page.locator('#confirm').fill('Short1')
    await page.getByRole('button').last().click()
    await expect(page.getByText(/invalid|недейств|expired|Ошибка/i)).toBeVisible()
  })
})

test.describe('«регистрация»: админ заводит студента, студент задаёт пароль по ссылке', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('полный путь от создания аккаунта в админке до входа студента', async ({ page, browser }) => {
    const email = `invited-${Date.now()}@lms.test`
    await page.goto('/admin/collections/users/create')
    await page.locator('#field-email').fill(email)
    await page.locator('#field-password').fill('Temp-Pass-12345')
    await page.locator('#field-confirm-password').fill('Temp-Pass-12345')
    await page.locator('#field-firstName').fill('Приглашённый')
    await page.locator('#field-lastName').fill('Студент')
    await page.getByRole('button', { name: /Сохранить|Save/ }).first().click()
    await expect(page).toHaveURL(/\/admin\/collections\/users\/\d+/)

    // Письмо не отправляется (SMTP выключен), но токен из него лежит в базе.
    const token = await resetTokenOf(email)
    const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const invited = await guest.newPage()
    await invited.goto(`/reset-password?token=${encodeURIComponent(token)}`)
    await invited.locator('#password').fill('My-Own-Pass-1')
    await invited.locator('#confirm').fill('My-Own-Pass-1')
    await invited.getByRole('button').last().click()
    await expect(invited).toHaveURL(/\/login\?reset=success/)

    await invited.getByLabel('Email').fill(email)
    await invited.getByLabel('Пароль').fill('My-Own-Pass-1')
    await invited.getByRole('button', { name: 'Войти' }).click()
    await expect(invited.getByRole('heading', { name: 'Привет, Приглашённый!' })).toBeVisible()
    await guest.close()

    await query('delete from users_sessions where _parent_id = (select id from users where email = $1)', [email])
    await query('delete from users where email = $1', [email])
  })
})
