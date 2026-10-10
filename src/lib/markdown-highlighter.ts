import type { HighlighterCore, LanguageInput } from 'shiki/core'

const languages: Record<string, () => Promise<LanguageInput>> = {
  javascript: () => import('shiki/langs/javascript.mjs').then((module) => module.default),
  typescript: () => import('shiki/langs/typescript.mjs').then((module) => module.default),
  jsx: () => import('shiki/langs/jsx.mjs').then((module) => module.default),
  tsx: () => import('shiki/langs/tsx.mjs').then((module) => module.default),
  html: () => import('shiki/langs/html.mjs').then((module) => module.default),
  css: () => import('shiki/langs/css.mjs').then((module) => module.default),
  json: () => import('shiki/langs/json.mjs').then((module) => module.default),
  bash: () => import('shiki/langs/bash.mjs').then((module) => module.default),
  sql: () => import('shiki/langs/sql.mjs').then((module) => module.default),
  yaml: () => import('shiki/langs/yaml.mjs').then((module) => module.default),
  markdown: () => import('shiki/langs/markdown.mjs').then((module) => module.default),
  go: () => import('shiki/langs/go.mjs').then((module) => module.default),
}
const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', sh: 'bash', yml: 'yaml', md: 'markdown', golang: 'go' }
let shared: Promise<HighlighterCore> | undefined
const loading = new Map<string, Promise<void>>()

export function markdownLanguage(language: string): string {
  return Object.hasOwn(aliases, language) ? aliases[language] : language
}

/** Один движок на вкладку, отдельные чанки только для языков открытого контента. */
export async function getMarkdownHighlighter(requested: string[]): Promise<HighlighterCore> {
  if (!shared) {
    shared = Promise.all([
      import('shiki/core'), import('shiki/engine/javascript'),
      import('shiki/themes/github-dark.mjs'), import('shiki/themes/github-light.mjs'),
    ]).then(([core, engine, dark, light]) => core.createHighlighterCore({
      themes: [dark.default, light.default], langs: [], engine: engine.createJavaScriptRegexEngine(),
    })).catch((error: unknown) => { shared = undefined; throw error })
  }
  const highlighter = await shared
  await Promise.all([...new Set(requested.map(markdownLanguage))].map(async (language) => {
    if (!Object.hasOwn(languages, language) || highlighter.getLoadedLanguages().includes(language)) return
    let pending = loading.get(language)
    if (!pending) {
      pending = languages[language]().then((grammar) => highlighter.loadLanguage(grammar)).finally(() => loading.delete(language))
      loading.set(language, pending)
    }
    await pending
  }))
  return highlighter
}
