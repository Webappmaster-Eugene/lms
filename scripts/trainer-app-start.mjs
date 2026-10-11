import { readRuntimeToken } from '../trainer-runtime/auth-token.mjs'

if (!process.env.TRAINER_RUNTIME_TOKEN && process.env.TRAINER_RUNTIME_TOKEN_FILE) {
  process.env.TRAINER_RUNTIME_TOKEN = readRuntimeToken(process.env.TRAINER_RUNTIME_TOKEN_FILE)
}

await import('../server.js')
