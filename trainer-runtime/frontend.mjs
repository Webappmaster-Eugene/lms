import { build } from 'esbuild'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parse, parseFragment, serialize, defaultTreeAdapter } from 'parse5'

const require = createRequire(import.meta.url)
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
const escapeScript = (value) => value.replace(/<\/script/gi, '<\\/script')
const escapeStyle = (value) => value.replace(/<\/style/gi, '<\\/style')

function resolveFile(files, requested, importer = '') {
  const relative = requested.replace(/^\.\//, '')
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), relative))
  if (resolved.startsWith('../') || resolved.startsWith('/')) throw new Error('Импорт за пределами проекта запрещён')
  const candidates = [resolved, ...['.tsx', '.ts', '.jsx', '.js', '.css', '.json'].map((extension) => resolved + extension), ...['/index.tsx', '/index.ts', '/index.jsx', '/index.js'].map((extension) => resolved + extension)]
  const found = candidates.find((candidate) => Object.hasOwn(files, candidate))
  if (!found) throw new Error(`Файл не найден: ${requested}`)
  return found
}

async function bundle(files, entry, react) {
  const source = react
    ? `import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './${entry}'; createRoot(document.getElementById('root')).render(React.createElement(App));`
    : `import './${entry}';`
  const output = await build({
    stdin: { contents: source, loader: 'tsx', sourcefile: '__entry.tsx', resolveDir: process.cwd() },
    bundle: true, write: false, outdir: '/build', platform: 'browser', target: 'es2022', jsx: 'automatic', minify: true,
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    plugins: [{
      name: 'student-files',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          if (args.namespace !== 'student' && path.posix.basename(args.importer) !== '__entry.tsx') return undefined
          if (/^(react|react-dom)(\/.*)?$/.test(args.path)) return { path: require.resolve(args.path) }
          if (!args.path.startsWith('.')) throw new Error(`Пакет ${args.path} недоступен. Поддерживаются React и локальные файлы`)
          return { path: resolveFile(files, args.path, args.namespace === 'student' ? args.importer : ''), namespace: 'student' }
        })
        builder.onLoad({ filter: /.*/, namespace: 'student' }, (args) => ({ contents: files[args.path], loader: args.path.endsWith('.module.css') ? 'local-css' : path.posix.extname(args.path).slice(1), resolveDir: '/' }))
      },
    }],
  })
  return {
    script: output.outputFiles.filter((file) => file.path.endsWith('.js')).map((file) => file.text).join('\n'),
    style: output.outputFiles.filter((file) => file.path.endsWith('.css')).map((file) => file.text).join('\n'),
  }
}

export async function buildPreview(language, files) {
  let document
  let script = ''
  let style = ''
  let hasViewport = false
  if (language === 'html') {
    if (typeof files['index.html'] !== 'string') throw new Error('Добавьте файл index.html')
    document = parse(files['index.html'])
    const entries = []
    let linkedCss = false
    const walk = (node) => {
      const attribute = (name) => node.attrs?.find((attr) => attr.name === name)?.value
      if (node.tagName === 'meta' && attribute('name')?.toLowerCase() === 'viewport') hasViewport = true
      if (node.tagName === 'link' && attribute('rel')?.toLowerCase() === 'stylesheet' && attribute('href')) {
        linkedCss = true
        const file = resolveFile(files, attribute('href'))
        const replacement = defaultTreeAdapter.createElement('style', 'http://www.w3.org/1999/xhtml', [])
        defaultTreeAdapter.appendChild(replacement, defaultTreeAdapter.createTextNode(escapeStyle(files[file])))
        defaultTreeAdapter.insertBefore(node.parentNode, replacement, node)
        defaultTreeAdapter.detachNode(node)
      }
      if (node.tagName === 'script' && attribute('src')) {
        entries.push(resolveFile(files, attribute('src')))
        defaultTreeAdapter.detachNode(node)
      }
      for (const child of [...(node.childNodes ?? [])]) walk(child)
    }
    walk(document)
    if (entries.length === 0 && files['script.js']) entries.push('script.js')
    for (const entry of entries) {
      const built = await bundle(files, entry, false)
      script += built.script + '\n'
      style += built.style + '\n'
    }
    if (!linkedCss && files['styles.css']) style += files['styles.css']
  } else if (language === 'react') {
    const entry = ['App.tsx', 'App.jsx', 'App.js', 'src/App.tsx', 'src/App.jsx', 'src/App.js'].find((file) => Object.hasOwn(files, file))
    if (!entry) throw new Error('Добавьте App.tsx или App.jsx с default export компонента')
    document = parse('<!doctype html><html><head></head><body><div id="root"></div></body></html>')
    const built = await bundle(files, entry, true)
    script = built.script
    style = built.style
    if (files['styles.css'] && !Object.values(files).some((value) => /import\s+["'](?:\.\/)?styles\.css["']/.test(value))) style += files['styles.css']
  } else {
    throw new Error('Next.js требует отдельного серверного runtime')
  }
  const html = document.childNodes.find((node) => node.tagName === 'html')
  const head = html.childNodes.find((node) => node.tagName === 'head')
  const body = html.childNodes.find((node) => node.tagName === 'body')
  const safety = parseFragment(`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">${hasViewport ? '' : '<meta name="viewport" content="width=device-width, initial-scale=1">'}`)
  const first = head.childNodes[0]
  for (const node of [...safety.childNodes]) {
    defaultTreeAdapter.detachNode(node)
    if (first) defaultTreeAdapter.insertBefore(head, node, first)
    else defaultTreeAdapter.appendChild(head, node)
  }
  for (const [tag, source] of [['style', escapeStyle(style)], ['script', escapeScript(script)]]) {
    const node = defaultTreeAdapter.createElement(tag, 'http://www.w3.org/1999/xhtml', [])
    defaultTreeAdapter.appendChild(node, defaultTreeAdapter.createTextNode(source))
    defaultTreeAdapter.appendChild(tag === 'style' ? head : body, node)
  }
  return serialize(document)
}
