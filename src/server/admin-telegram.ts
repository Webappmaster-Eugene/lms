// Хуки Payload импортируют модуль и вне серверного окружения React (CLI миграций), поэтому без 'server-only'.
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import type { PayloadRequest } from 'payload'

import { logger } from '@/lib/telemetry'
import { afterCommit } from '@/server/after-commit'

/**
 * Уведомления администратору в Telegram (решение владельца 30.10.2026): письма команде
 * и события буткемпа дублируются в бота. Из домашней сети прода api.telegram.org не
 * открывается, поэтому запрос идёт через CONNECT-прокси на VDS по туннелю
 * (TELEGRAM_PROXY_URL). Без токена или чата уведомления молча выключены.
 */

const API_HOST = 'api.telegram.org'
// С VDS примерно каждое пятое соединение с Telegram зависает (30.10.2026): короткий таймаут и повтор.
const TIMEOUT_MS = 8_000
const ATTEMPTS = 3
// Предел Telegram - 4096 знаков; запас на ссылку.
const MAX_TEXT = 3800
// Сбой почты или наплыв заявок не должен превращаться в сотни сообщений.
const MAX_PER_MINUTE = 40

export type AdminEvent = {
  title: string
  lines?: Array<string | null | undefined | false>
  link?: string | null
}

export type AdminTelegramConfig = { token: string, chats: string[], proxy: URL | null }

function config(): AdminTelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? ''
  const chats = (process.env.TELEGRAM_ADMIN_CHAT_ID ?? '').split(',').map((chat) => chat.trim()).filter((chat) => /^-?\d{1,20}$/.test(chat))
  if (!/^\d+:[\w-]{20,}$/.test(token) || chats.length === 0) return null
  const proxyText = process.env.TELEGRAM_PROXY_URL?.trim()
  let proxy: URL | null = null
  if (proxyText) {
    try {
      proxy = new URL(proxyText)
    } catch {
      logger.warn('TELEGRAM_PROXY_URL is not a URL: admin Telegram notifications are off')
      return null
    }
  }
  return { token, chats, proxy }
}

export function adminLink(path: string): string {
  return `${(process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}${path}`
}

/** Обычный текст без разметки: имена и сообщения учеников не нужно экранировать. */
export function formatAdminEvent(event: AdminEvent): string {
  const lines = (event.lines ?? []).filter((line): line is string => typeof line === 'string' && line.trim() !== '')
  const body = [event.title, ...lines].join('\n')
  const cut = body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT - 1)}…` : body
  return event.link ? `${cut}\n${event.link}` : cut
}

const WINDOW = Symbol.for('lms.adminTelegram.sent')
function takeSlot(now = Date.now()): boolean {
  const holder = globalThis as unknown as Record<symbol, number[] | undefined>
  const sent = (holder[WINDOW] ??= []).filter((at) => now - at < 60_000)
  holder[WINDOW] = sent
  if (sent.length >= MAX_PER_MINUTE) return false
  sent.push(now)
  return true
}

function tunnel(proxy: URL): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: proxy.hostname, port: Number(proxy.port || 80), method: 'CONNECT', path: `${API_HOST}:443`, headers: { host: `${API_HOST}:443` }, timeout: TIMEOUT_MS })
    req.once('connect', (response, socket) => {
      if (response.statusCode === 200) resolve(socket)
      else {
        socket.destroy()
        reject(new Error(`proxy answered ${response.statusCode}`))
      }
    })
    req.once('timeout', () => req.destroy(new Error('proxy did not answer in time')))
    req.once('error', reject)
    req.end()
  })
}

type Reply = { status: number, body: string }

async function post(cfg: AdminTelegramConfig, method: string, payload: unknown): Promise<Reply> {
  const body = JSON.stringify(payload)
  const socket = cfg.proxy ? await tunnel(cfg.proxy) : null
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      host: API_HOST,
      port: 443,
      method: 'POST',
      path: `/bot${cfg.token}/${method}`,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: TIMEOUT_MS,
      // Без agent: с agent: false Node берёт свой агент и молча идёт мимо прокси.
      ...(socket ? { createConnection: () => tlsConnect({ socket, servername: API_HOST }) } : {}),
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.once('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
      response.once('error', reject)
    })
    req.once('timeout', () => req.destroy(new Error('Telegram did not answer in time')))
    req.once('error', reject)
    req.end(body)
  })
}

/** Отправка одного текста в один чат. Вынесено в объект, чтобы тесты подменяли доставку. */
export const adminTelegramTransport = {
  async send(cfg: AdminTelegramConfig, chat: string, text: string): Promise<void> {
    let failure: unknown = null
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      let reply: Reply
      try {
        reply = await post(cfg, 'sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true } })
      } catch (error) {
        failure = error
        continue
      }
      if (reply.status === 200) return
      let parsed: { description?: string, parameters?: { retry_after?: number } } = {}
      try {
        parsed = JSON.parse(reply.body)
      } catch {
        // Ответ не JSON (прокси, обрыв): описания нет, остаётся код.
      }
      failure = new Error(`Telegram answered ${reply.status}: ${parsed.description ?? 'no description'}`)
      const wait = parsed.parameters?.retry_after
      if (reply.status === 429 && typeof wait === 'number' && wait <= 10) {
        await new Promise((resolve) => setTimeout(resolve, wait * 1000))
        continue
      }
      // 4xx кроме 429 - неверный токен или чат: повтор не поможет.
      if (reply.status < 500) break
    }
    throw failure
  },
}

/** Токен бота стоит в пути запроса: в журнал не должен попасть ни целиком, ни в тексте ошибки. */
function scrub(error: unknown, token: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(message.split(token).join('<token>'))
}

/** Никогда не бросает: уведомление вторично к действию, которое его вызвало. */
export async function notifyAdmins(event: AdminEvent): Promise<void> {
  const cfg = config()
  if (!cfg) return
  if (!takeSlot()) {
    logger.warn('Admin Telegram notification dropped: per-minute limit reached', { 'telegram.title': event.title.slice(0, 80) })
    return
  }
  const text = formatAdminEvent(event)
  for (const chat of cfg.chats) {
    try {
      await adminTelegramTransport.send(cfg, chat, text)
    } catch (error) {
      logger.error('Admin Telegram notification failed', scrub(error, cfg.token), { 'telegram.title': event.title.slice(0, 80) })
    }
  }
}

/**
 * Из хука: уходит только после фиксации транзакции, иначе при откате пришло бы сообщение
 * о несуществующем. Отправку не ждём: медленный Telegram не должен держать сохранение.
 */
export function notifyAdminsAfterCommit(req: PayloadRequest, event: AdminEvent): Promise<void> {
  return afterCommit(req, async () => {
    void notifyAdmins(event)
  })
}

/** Короткая выдержка из текста пользователя: без переводов строк по краям и не длиннее limit. */
export function excerpt(text: string | null | undefined, limit = 600): string {
  const clean = (text ?? '').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}
