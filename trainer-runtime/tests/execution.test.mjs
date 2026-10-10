import assert from 'node:assert/strict'
import test from 'node:test'
import { runJob } from '../gateway.mjs'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { sandboxArgs } from '../gateway.mjs'

const enabled = process.env.TRAINER_RUNTIME_INTEGRATION === '1'
test('React native submit events work with opaque origin and no native form navigation', { skip: !enabled, timeout: 30000 }, async () => {
  const files = { 'App.jsx': `import {useState} from 'react';
export default function App(){const [count,setCount]=useState(0);return <main><form onSubmit={event=>{event.preventDefault();setCount(value=>value+1)}}><input id="name"/><button id="submit" type="submit">Send</button></form><output>{count}</output></main>}` }
  const result = await runJob({ language: 'react', code: JSON.stringify(files), timeLimitMs: 5000, cases: [{ name: 'native submit', hidden: false, checks: [
    { selector: '#name', action: 'fill', value: 'React' }, { selector: '#submit', action: 'click' }, { selector: 'output', text: '1' },
    { selector: '#name', action: 'press', value: 'Enter' }, { selector: 'output', text: '2' },
  ] }] })
  assert.equal(result.status, 'passed', JSON.stringify(result))
})

test('form capability never grants parent DOM access or navigation beyond trusted CSP', { skip: !enabled, timeout: 30000 }, async () => {
  const files = { 'index.html': `<form id="form" action="https://outside.invalid/collect" method="post"><input name="value" value="test"/><button id="send">Send</button></form><output id="submitted">pending</output><output id="blocked">pending</output><output id="origin">pending</output>
<script>try { void parent.document; document.querySelector('#origin').textContent='unsafe' } catch { document.querySelector('#origin').textContent='isolated' }
document.querySelector('#form').addEventListener('submit',()=>{document.querySelector('#submitted').textContent='event worked'})
document.addEventListener('securitypolicyviolation',event=>{if(event.violatedDirective==='form-action')document.querySelector('#blocked').textContent='blocked by CSP'})</script>` }
  const result = await runJob({ language: 'html', code: JSON.stringify(files), timeLimitMs: 5000, cases: [{ name: 'form isolation', hidden: false, checks: [
    { selector: '#origin', text: 'isolated' }, { selector: '#send', action: 'click' },
    { selector: '#submitted', text: 'event worked' }, { selector: '#blocked', text: 'blocked by CSP' },
  ] }] })
  assert.equal(result.status, 'passed', JSON.stringify(result))
})

test('image watchdog stops a stuck process without gateway cleanup', { skip: !enabled, timeout: 60000 }, async () => {
  const name = `lms-trainer-watchdog-${randomUUID()}`
  const args = sandboxArgs(name, process.env.TRAINER_GO_JOB_IMAGE || 'lms-trainer-go:local')
  args.splice(args.indexOf('-i'), 0, '--entrypoint', '/usr/bin/timeout')
  args.push('--signal=KILL', '2s', 'node', '-e', 'process.stdout.write("started\\n");process.on("SIGTERM",()=>{});setInterval(()=>{},1000)')
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 50000)
  const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], signal: controller.signal })
  let stderr = ''
  let stdout = ''
  let executionStarted
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.stdout.on('data', (chunk) => { stdout += chunk; if (executionStarted === undefined && stdout.includes('started\n')) executionStarted = performance.now() })
  try {
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
    assert.equal(code, 137, stderr)
    assert.notEqual(executionStarted, undefined, 'Watchdog command must start before its execution time is measured')
    assert.ok(performance.now() - executionStarted < 10000, 'Watchdog execution exceeded its 2-second deadline plus Docker stop overhead')
  } finally {
    clearTimeout(deadline)
    controller.abort()
    await new Promise((resolve) => {
      const cleanup = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' })
      const timer = setTimeout(() => { cleanup.kill('SIGKILL'); resolve() }, 5000)
      cleanup.on('error', () => { clearTimeout(timer); resolve() })
      cleanup.on('close', () => { clearTimeout(timer); resolve() })
    })
  }
})
test('Go really compiles, consumes stdin and cannot leak hidden expected/input', { skip: !enabled, timeout: 120000 }, async () => {
  const code = 'package main\nimport("fmt";"os";"io")\nfunc main(){ b,_:=io.ReadAll(os.Stdin);fmt.Print(string(b)) }'
  const job = { language: 'go', code, timeLimitMs: 1000, cases: [{ name: 'visible', hidden: false, input: 'hello', expected: 'hello' }, { name: 'secret name', hidden: true, input: 'secret input', expected: 'secret expected' }] }
  const result = await runJob(job)
  assert.equal(result.status, 'failed')
  assert.equal(result.tests[0].passed, true)
  assert.equal(result.tests[1].passed, false)
  const hidden = JSON.stringify(result.tests[1])
  for (const secret of ['secret name', 'secret input', 'secret expected']) assert.equal(hidden.includes(secret), false)
})

test('Go busy loop and unbounded output finish within container limits', { skip: !enabled, timeout: 150000 }, async () => {
  for (const code of ['package main\nfunc main(){for{}}', 'package main\nimport"fmt"\nfunc main(){for{fmt.Print("too much output")}}']) {
    const result = await runJob({ language: 'go', code, timeLimitMs: 100, cases: [{ name: 'bounded', hidden: false, input: '', expected: '' }] })
    assert.equal(result.status, 'failed')
    assert.equal(result.tests[0].passed, false)
  }
})

test('real Go process has no host environment, root write access or outbound network', { skip: !enabled, timeout: 120000 }, async () => {
  const code = 'package main\nimport("fmt";"os";"net";"time")\nfunc main(){if len(os.Environ())!=0||os.Getuid()!=10001{panic("environment")};if os.WriteFile("/runtime/pwned",[]byte("x"),0600)==nil{panic("writable")};conn,err:=net.DialTimeout("tcp","1.1.1.1:443",200*time.Millisecond);if err==nil{conn.Close();panic("network")};fmt.Print("isolated")}'
  const result = await runJob({ language: 'go', code, timeLimitMs: 1000, cases: [{ name: 'isolation', hidden: false, input: '', expected: 'isolated' }] })
  assert.equal(result.status, 'passed', JSON.stringify(result))
})

test('HTML and React actually render, click and use local CSS without network', { skip: !enabled, timeout: 120000 }, async () => {
  const projects = [
    { language: 'html', files: { 'index.html': '<link rel="stylesheet" href="styles.css"><button onclick="this.textContent=\'1\'">0</button>', 'styles.css': 'button { color: rgb(255, 0, 0) }' } },
    { language: 'react', files: { 'App.jsx': 'import {useState} from "react";export default function App(){const[n,set]=useState(0);return <button onClick={()=>set(n+1)}>{n}</button>}', 'styles.css': 'button { color: rgb(255, 0, 0) }' } },
  ]
  for (const { language, files } of projects) {
    const result = await runJob({ language, code: JSON.stringify(files), timeLimitMs: 2500, includePreview: true, cases: [{ name: 'click', hidden: false, checks: [{ selector: 'button', text: '0', css: { color: 'rgb(255, 0, 0)' } }, { selector: 'button', action: 'click' }, { selector: 'button', text: '1' }] }, { name: 'do not reveal', hidden: true, checks: [{ selector: 'button', text: 'secret expected' }] }] })
    assert.ok(result.result, JSON.stringify(result))
    assert.equal(result.result.tests[0].passed, true, JSON.stringify(result))
    assert.equal(result.result.tests[1].passed, false)
    assert.equal(JSON.stringify(result.result).includes('secret expected'), false)
    assert.ok(result.preview.html.includes('connect-src'))
  }
})

test('malformed JSX reports compile_error and hidden assertions stay outside preview', { skip: !enabled, timeout: 30000 }, async () => {
  const result = await runJob({ language: 'react', code: JSON.stringify({ 'App.jsx': 'export default function(){return <broken' }), timeLimitMs: 1000, cases: [{ name: 'hidden', hidden: true, checks: [{ selector: 'button', text: 'do not leak' }] }] })
  assert.equal(result.status, 'compile_error')
  assert.equal(JSON.stringify(result).includes('do not leak'), false)
})

test('browser cannot read parent origin and hidden actions cannot leak through console', { skip: !enabled, timeout: 30000 }, async () => {
  const files = { 'index.html': '<p id="origin"></p><input oninput="console.log(this.value)"><script>try{parent.document.body;document.querySelector("#origin").textContent="same-origin"}catch{document.querySelector("#origin").textContent="isolated"}</script>' }
  const result = await runJob({ language: 'html', code: JSON.stringify(files), timeLimitMs: 2000, cases: [{ name: 'origin', hidden: false, checks: [{ selector: '#origin', text: 'isolated' }] }, { name: 'hidden value', hidden: true, checks: [{ selector: 'input', action: 'fill', value: 'hidden value must stay private' }] }] })
  assert.equal(result.status, 'passed', JSON.stringify(result))
  assert.equal(JSON.stringify(result).includes('hidden value must stay private'), false)
})

test('browser waits for an asynchronous update within the full case time budget', { skip: !enabled, timeout: 30000 }, async () => {
  const files = { 'index.html': '<p>waiting</p><script>setTimeout(()=>document.querySelector("p").textContent="ready",1200)</script>' }
  const result = await runJob({ language: 'html', code: JSON.stringify(files), timeLimitMs: 2500, cases: [{ name: 'delayed update', hidden: false, checks: [{ selector: 'p', text: 'ready' }] }] })
  assert.equal(result.status, 'passed', JSON.stringify(result))
})

test('student JS cannot spoof computed CSS styles used by the grader', { skip: !enabled, timeout: 30000 }, async () => {
  const files = { 'index.html': '<div class="box">x</div><script>const fake=(p)=>p==="display"?"flex":"16px";window.getComputedStyle=()=>({getPropertyValue:fake});CSSStyleDeclaration.prototype.getPropertyValue=fake</script>' }
  const result = await runJob({ language: 'html', code: JSON.stringify(files), timeLimitMs: 1500, cases: [{ name: 'real browser CSS', hidden: false, checks: [{ selector: '.box', css: { display: 'flex' } }] }, { name: 'real browser shorthand CSS', hidden: false, checks: [{ selector: '.box', css: { gap: '16px' } }] }] })
  assert.equal(result.status, 'failed', JSON.stringify(result))
  assert.equal(result.tests[0].passed, false)
  assert.equal(result.tests[1].passed, false)
})

test('React CSS Modules exports class names and applies imported local styles', { skip: !enabled, timeout: 30000 }, async () => {
  const files = { 'App.jsx': 'import styles from "./Button.module.css";export default function App(){return <button className={styles.button}>CSS Modules</button>}', 'Button.module.css': '.button{color:rgb(255, 0, 0);display:flex;gap:16px}' }
  const result = await runJob({ language: 'react', code: JSON.stringify(files), timeLimitMs: 5000, cases: [{ name: 'CSS Modules', hidden: false, checks: [{ selector: 'button', text: 'CSS Modules', css: { color: 'rgb(255, 0, 0)', display: 'flex', gap: '16px' } }] }] })
  assert.equal(result.status, 'passed', JSON.stringify(result))
})

test('browser keyboard checks press Escape to close a dialog and Space to activate a button', { skip: !enabled, timeout: 30000 }, async () => {
  const files = { 'index.html': '<button id="open" type="button" onclick="document.querySelector(\'dialog\').showModal()">Открыть</button><dialog><p>Диалог</p></dialog>' }
  const result = await runJob({ language: 'html', code: JSON.stringify(files), timeLimitMs: 3000, cases: [{ name: 'keyboard interaction', hidden: false, checks: [
    { selector: '#open', action: 'press', value: 'Space' },
    { selector: 'dialog', visible: true },
    { selector: 'dialog', action: 'press', value: 'Escape' },
    { selector: 'dialog', visible: false },
  ] }] })
  assert.equal(result.status, 'passed', JSON.stringify(result))
})
