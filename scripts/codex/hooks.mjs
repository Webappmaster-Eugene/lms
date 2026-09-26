#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { doctor, repo, workspace, run } from "./harness.mjs";

// Claude keeps these denied even in bypass mode. Codex runs with
// approval_policy = never, so this list is the matching guardrail; it is not a
// shell security boundary. Used when no Claude settings exist on the machine.
const fallbackDeny = ["sudo *", "git reset --hard*", "git clean*", "dd *", "mkfs*", "newfs*", "shred *",
  "diskutil erase*", "diskutil apfs delete*", "diskutil partitionDisk*", "diskutil reformat*", "chmod -R 777 *"];

export function claudeSettingsFiles(home = homedir()) {
  return [join(home, ".claude/settings.json"), ...[...new Set([workspace, repo])]
    .flatMap(root => [join(root, ".claude/settings.json"), join(root, ".claude/settings.local.json")])];
}

export function claudeDenyPatterns(files = claudeSettingsFiles()) {
  const patterns = new Set(fallbackDeny);
  for (const file of files) {
    if (!existsSync(file)) continue;
    let settings;
    try { settings = JSON.parse(readFileSync(file, "utf8")); }
    catch { process.stderr.write(`LMS hook: cannot parse ${file}; its deny rules are not applied\n`); continue; }
    for (const rule of settings.permissions?.deny ?? []) {
      const match = /^Bash\((.+)\)$/.exec(rule);
      if (match) patterns.add(match[1].replace(/:\*$/, "*"));
    }
  }
  return [...patterns];
}

const shells = /^(?:\S*\/)?(?:ba|z|da|k)?sh\s+(?:-\w+\s+)*-\w*c\w*\s+(.+)$/s;
const wrappers = /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|command|exec|env|nohup|time|builtin)\s+)+/;
const gitOptions = /^git\s+(?:(?:-C|-c)\s+\S+\s+|--[\w-]+(?:=\S+)?\s+)+/;

function segments(command) {
  const result = [];
  for (const raw of command.split(/&&|\|\||[;|&\n()`]|\$\(/)) {
    const segment = raw.trim().replace(/\s+/g, " ").replace(wrappers, "").replace(gitOptions, "git ");
    const nested = shells.exec(segment);
    if (nested) { result.push(...segments(nested[1].replace(/^(['"])(.*)\1$/s, "$2"))); continue; }
    if (segment) result.push(segment);
  }
  return result;
}

export function deniedCommand(command, patterns = claudeDenyPatterns(), home = homedir()) {
  const matchers = patterns.map(pattern => ({ pattern, regexp: new RegExp(`^${pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "s") }));
  for (const segment of segments(command)) {
    const variants = new Set([segment, segment.replaceAll(/\$\{?HOME\}?/g, "~").replaceAll(home, "~"), segment.replaceAll(/\$\{?HOME\}?|~(?=\/|$| )/g, home)]);
    for (const variant of variants) {
      const hit = matchers.find(({ regexp }) => regexp.test(variant));
      if (hit) return hit.pattern;
    }
  }
  return null;
}

function commandOf(input) {
  const command = input?.command ?? input?.cmd;
  if (!Array.isArray(command)) return typeof command === "string" ? command : null;
  // Codex passes argv, usually ["bash", "-lc", script].
  return /^(?:\S*\/)?(?:ba|z)?sh$/.test(command[0] ?? "") && command.length >= 3 ? command.at(-1) : command.join(" ");
}

export function claudeMemoryDir(home = homedir()) {
  return join(home, ".claude/projects", workspace.replace(/[^A-Za-z0-9]/g, "-"), "memory");
}

// Claude auto-memory is read live so facts saved by Claude reach Codex without a sync.
function claudeMemory(dir = claudeMemoryDir()) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(name => name.endsWith(".md")).sort((a, b) => (a === "MEMORY.md" ? -1 : b === "MEMORY.md" ? 1 : a.localeCompare(b)));
  if (!files.length) return null;
  return `Claude auto-memory (${dir}), read-only for Codex:\n\n${files.map(name => `### ${name}\n${readFileSync(join(dir, name), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim()}`).join("\n\n")}`.slice(0, 24000);
}

export function handleEvent(event) {
  if (event.hook_event_name === "SessionStart") {
    const notes = [".codex/memory/MEMORY.md", ".codex/state/handoff.md"]
      .filter(path => existsSync(join(repo, path)))
      .map(path => `${path}\n${readFileSync(join(repo, path), "utf8").slice(0, 16000)}`);
    const claude = claudeMemory();
    if (claude) notes.push(claude);
    return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `LMS repository: ${repo}. Read AGENTS.md and .codex/context/CLAUDE.md before editing.\n\n${notes.join("\n\n")}` } };
  }
  if (event.hook_event_name === "PreToolUse") {
    const command = commandOf(event.tool_input);
    const pattern = command && deniedCommand(command);
    if (!pattern) return {};
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `Запрещено правилом Claude «Bash(${pattern})». Нужна явная просьба пользователя выполнить это вручную.` } };
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
  } catch (error) {
    process.stderr.write(`LMS hook failed: ${error.message}\n`);
    process.stdout.write(JSON.stringify({ systemMessage: "LMS hook could not complete; run pnpm codex:doctor manually." }));
  }
}
