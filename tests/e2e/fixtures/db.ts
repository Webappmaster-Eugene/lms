import pg from 'pg'

import { databaseUrl } from '../../../scripts/test-db.mjs'
import { APP_URL } from './env'

/**
 * Прямой доступ к одноразовой базе e2e — только там, где у пользователя есть
 * внешний канал, которого нет у теста: ссылка из письма-приглашения.
 */
const DB = `lms_e2e_${new URL(APP_URL).port || '3100'}`

export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: databaseUrl(DB) })
  await client.connect()
  try {
    return (await client.query<T>(sql, params)).rows
  } finally {
    await client.end()
  }
}

/** Токен из письма-приглашения / сброса пароля (Payload хранит его в users). */
export async function resetTokenOf(email: string): Promise<string> {
  const rows = await query<{ reset_password_token: string | null }>(
    'select reset_password_token from users where email = $1',
    [email],
  )
  const token = rows[0]?.reset_password_token
  if (!token) throw new Error(`У ${email} нет токена сброса пароля`)
  return token
}
