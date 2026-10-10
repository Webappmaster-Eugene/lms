export function stripMarkdownEmphasis(text: string): string {
  return text
    // **bold** / __bold__ → bold, run twice so ***both*** collapses fully
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    // Leading markdown headings: "## Решения" → "РЕШЕНИЯ" is the model's job, but strip the
    // hashes if it falls back to them.
    .replace(/^#{1,6}\s+/gm, '')
    // A lone asterisk used as a bullet becomes a dash; emphasis around a single word goes.
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/(?<!\S)\*(\S[^*\n]*?\S|\S)\*(?!\S)/g, '$1')
    .trim()
}
