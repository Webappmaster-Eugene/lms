export const ANALYSIS_CHUNK_SECONDS = 10 * 60

/** Opus padding and a sub-second ending must not become a separate, empty STT request. */
export function planAnalysisChunks(durationSeconds: number): Array<{ startSeconds: number; durationSeconds: number }> {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 4 * 60 * 60) return []
  const starts = [0]
  for (let start = ANALYSIS_CHUNK_SECONDS; durationSeconds - start >= 2; start += ANALYSIS_CHUNK_SECONDS) starts.push(start)
  return starts.map((startSeconds, index) => ({ startSeconds, durationSeconds: (starts[index + 1] ?? durationSeconds) - startSeconds }))
}
