import assert from 'node:assert/strict'
import test from 'node:test'
import { runJob } from '../gateway.mjs'

const enabled = process.env.TRAINER_RUNTIME_INTEGRATION === '1'
const python = (code, cases = [{ name: 'visible', hidden: false, input: '', expected: '' }], timeLimitMs = 1000) => ({ language: 'python', code, cases, timeLimitMs })

test('Python executes standard library and UTF-8 stdin/stdout in a fresh process per case', { skip: !enabled, timeout: 60000 }, async () => {
  const code = 'import json, sys\nfrom collections import Counter\nfrom pathlib import Path\nassert not Path("/tmp/previous-case").exists()\nPath("/tmp/previous-case").write_text("written")\ncounts = Counter(json.loads(sys.stdin.read()))\nprint(json.dumps(dict(sorted(counts.items())), ensure_ascii=False))\n'
  const cases = [
    { name: 'Unicode', hidden: false, input: '["я", "а", "я"]', expected: '{"а": 1, "я": 2}' },
    { name: 'Fresh container', hidden: false, input: '["b", "a", "b"]', expected: '{"a": 1, "b": 2}' },
  ]
  const result = await runJob(python(code, cases))
  assert.equal(result.status, 'passed', JSON.stringify(result))
  assert.equal(result.passedCount, 2)
})

test('Python syntax checking does not execute student statements and runtime exceptions fail normally', { skip: !enabled, timeout: 60000 }, async () => {
  const syntax = await runJob(python('print("must not execute")\nif True print("bad syntax")'))
  assert.equal(syntax.status, 'compile_error', JSON.stringify(syntax))
  assert.match(syntax.error, /SyntaxError/)
  assert.deepEqual(syntax.tests, [])
  const contextualSyntax = await runJob(python('return 1'))
  assert.equal(contextualSyntax.status, 'compile_error', JSON.stringify(contextualSyntax))
  assert.match(contextualSyntax.error, /SyntaxError/)
  const error = await runJob(python('raise ValueError("visible exception")'))
  assert.equal(error.status, 'failed', JSON.stringify(error))
  assert.match(error.tests[0].message, /ValueError: visible exception/)
})

test('Python busy loops and unbounded output cannot exceed sandbox limits', { skip: !enabled, timeout: 60000 }, async () => {
  for (const code of ['while True:\n    pass', 'while True:\n    print("too much output" * 1000)']) {
    const result = await runJob(python(code, undefined, 100))
    assert.equal(result.status, 'failed', JSON.stringify(result))
    assert.equal(result.tests[0].passed, false)
    assert.match(result.tests[0].message, /Превышен лимит (времени|вывода)/)
  }
})

test('Python cannot leak hidden case input, expected values or exception text', { skip: !enabled, timeout: 60000 }, async () => {
  const cases = [
    { name: 'public', hidden: false, input: 'hello', expected: 'hello' },
    { name: 'private-case', hidden: true, input: 'private-input', expected: 'private-expected' },
  ]
  const result = await runJob(python('import sys\nvalue = sys.stdin.read()\nprint(value)\nif value.startswith("private"):\n    raise RuntimeError(value)', cases))
  assert.equal(result.status, 'failed', JSON.stringify(result))
  assert.equal(result.tests[0].passed, true)
  for (const secret of ['private-case', 'private-input', 'private-expected']) assert.equal(JSON.stringify(result).includes(secret), false)
})

test('Python has no host secrets, Docker socket, root write access or outbound network', { skip: !enabled, timeout: 60000 }, async () => {
  const code = `import os, socket
from pathlib import Path
assert os.getuid() == 10001
assert not any(key in os.environ for key in ["DATABASE_URL", "PAYLOAD_SECRET", "TRAINER_RUNTIME_TOKEN", "HOME", "PATH"])
assert not Path("/var/run/docker.sock").exists()
assert not Path("/run/docker.sock").exists()
try:
    Path("/runtime/pwned").write_text("write")
except OSError:
    pass
else:
    raise RuntimeError("writable root")
connection = socket.socket()
connection.settimeout(0.2)
try:
    connection.connect(("1.1.1.1", 443))
except OSError:
    pass
else:
    raise RuntimeError("outbound network")
finally:
    connection.close()
print("isolated")`
  const result = await runJob(python(code, [{ name: 'isolation', hidden: false, input: '', expected: 'isolated' }]))
  assert.equal(result.status, 'passed', JSON.stringify(result))
})

test('Python console mode reports output, runtime errors and timeout without fake graded cases', { skip: !enabled, timeout: 60000 }, async () => {
  const execute = (code) => runJob({ ...python(code, [], 200), allowNoTests: true })
  const success = await execute('print("console output")')
  assert.equal(success.status, 'passed', JSON.stringify(success))
  assert.deepEqual(success.tests, [])
  assert.equal(success.consoleOutput[0], 'console output')
  const error = await execute('raise RuntimeError("console error")')
  assert.equal(error.status, 'error', JSON.stringify(error))
  assert.match(error.error, /console error/)
  const timeout = await execute('while True:\n    pass')
  assert.equal(timeout.status, 'timeout', JSON.stringify(timeout))
})
