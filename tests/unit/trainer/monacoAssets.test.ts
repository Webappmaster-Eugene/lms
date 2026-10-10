import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execute = promisify(execFile)

describe('ассеты языков frontend в Monaco', () => {
  it('обновляет старый stamp того же пакета и сохраняет все нужные воркеры', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lms-monaco-copy-'))
    try {
      const script = join(directory, 'scripts/copy-monaco.mjs')
      const source = join(directory, 'node_modules/monaco-editor/min/vs')
      const target = join(directory, 'public/monaco')
      await mkdir(join(directory, 'scripts'), { recursive: true })
      await mkdir(join(source, 'assets'), { recursive: true })
      await mkdir(join(directory, 'node_modules/@types/react'), { recursive: true })
      await mkdir(join(directory, 'node_modules/csstype'), { recursive: true })
      await mkdir(join(target, 'vs/assets'), { recursive: true })
      await writeFile(script, await readFile(new URL('../../../scripts/copy-monaco.mjs', import.meta.url), 'utf8'))
      await writeFile(join(directory, 'node_modules/monaco-editor/package.json'), JSON.stringify({ name: 'monaco-editor', version: '0.55.1' }))
      await writeFile(join(directory, 'node_modules/@types/react/package.json'), JSON.stringify({ name: '@types/react', version: '19.3.0' }))
      await writeFile(join(directory, 'node_modules/csstype/index.d.ts'), 'export interface Properties {}')
      await writeFile(join(directory, 'node_modules/@types/react/global.d.ts'), 'interface Event {}')
      await writeFile(join(directory, 'node_modules/@types/react/index.d.ts'), 'export as namespace React;\nexport = React;\ndeclare namespace React {}')
      for (const name of ['jsx-runtime.d.ts', 'jsx-dev-runtime.d.ts']) {
        await writeFile(join(directory, `node_modules/@types/react/${name}`), 'import * as React from "./";')
      }
      for (const language of ['editor', 'ts', 'css', 'html', 'json']) {
        await writeFile(join(source, `assets/${language}.worker-example.js`), `// ${language} worker`)
      }
      await writeFile(join(source, 'nls.messages.ru.js.js'), '// ru')
      await writeFile(join(source, 'nls.messages.de.js.js'), '// de')
      await writeFile(join(target, '.version'), '0.55.1')

      await execute(process.execPath, [script])

      for (const language of ['editor', 'ts', 'css', 'html', 'json']) {
        expect(await readFile(join(target, `vs/assets/${language}.worker-example.js`), 'utf8')).toBe(`// ${language} worker`)
      }
      expect(await readFile(join(target, 'vs/nls.messages.ru.js.js'), 'utf8')).toBe('// ru')
      await expect(readFile(join(target, 'vs/nls.messages.de.js.js'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(join(target, '.version'), 'utf8')).not.toBe('0.55.1')
      const types: Record<string, string> = JSON.parse(await readFile(join(target, 'react-types.json'), 'utf8'))
      expect(types['react.d.ts']).toContain("declare module 'react'")
      expect(types['react.d.ts']).not.toContain('export as namespace React;')
      expect(types['jsx-runtime.d.ts']).toContain('from "react"')
      expect(types['csstype.d.ts']).toContain("declare module 'csstype'")

      const repeated = await execute(process.execPath, [script])
      expect(repeated.stdout).toContain('уже на месте')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
