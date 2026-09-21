#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { doctor, repo, run } from "./harness.mjs";

export function handleEvent(event) {
  if (event.hook_event_name === "SessionStart") {
    const notes = [".codex/memory/MEMORY.md", ".codex/state/handoff.md"]
      .filter(path => existsSync(join(repo, path)))
      .map(path => `${path}\n${readFileSync(join(repo, path), "utf8").slice(0, 16000)}`);
    return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `LMS repository: ${repo}. Read AGENTS.md and .codex/context/CLAUDE.md before editing.\n\n${notes.join("\n\n")}` } };
  }
  if (event.hook_event_name === "Stop") {
    // Never create an endless continuation loop on a pre-existing failure.
    if (event.stop_hook_active) return { systemMessage: "Повторная остановка: сообщи о неустранённых ограничениях и фактических проверках." };
    const failures = doctor();
    for (const args of [["diff", "--check"], ["diff", "--cached", "--check"]]) {
      if (run("git", args).status !== 0) failures.push(`git ${args.join(" ")} failed; inspect changed lines.`);
    }
    if (failures.length) return { decision: "block", reason: `Project harness checks failed. Resolve or report the concrete blocker; do not claim verification passed.\n${failures.join("\n")}` };
    return {};
  }
  return {};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const event = JSON.parse(readFileSync(0, "utf8"));
    process.stdout.write(JSON.stringify(handleEvent(event)));
  } catch { process.stdout.write(JSON.stringify({ systemMessage: "LMS hook could not complete; run pnpm codex:doctor manually." })); }
}
