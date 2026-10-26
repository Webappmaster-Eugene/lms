/**
 * Подставной раннер для тестов пула песочницы.
 *
 * Говорит по тому же IPC-протоколу, что и runner-child.mjs, но вместо прогона
 * решения делает то, что попросил тест: сообщает своё окружение, падает,
 * зависает или пишет в stderr. Так поведение пула проверяется на настоящих
 * процессах, без подмены child_process.
 */
process.on('message', (message) => {
  const { id, payload } = message ?? {}
  const action = payload?.action
  if (action === 'env') {
    process.send({ id, ok: true, result: { env: Object.keys(process.env), execArgv: process.execArgv, pid: process.pid } })
  } else if (action === 'echo') {
    process.send({ id, ok: true, result: { value: payload.value, pid: process.pid } })
  } else if (action === 'fail') {
    process.send({ id, ok: false, ...(payload.error === undefined ? {} : { error: payload.error }) })
  } else if (action === 'stale') {
    process.send({ ready: true })
    process.send({ id: id + 1000, ok: true, result: 'чужой ответ' })
    process.send({ id, ok: true, result: 'свой ответ' })
  } else if (action === 'stderr') {
    process.stderr.write(payload.text)
    process.send({ id, ok: true, result: 'записано' })
  } else if (action === 'exit') {
    setTimeout(() => process.exit(payload.code), payload.delayMs ?? 0)
  }
  // action === 'hang': не отвечаем вовсе
})

process.send({ ready: true })
