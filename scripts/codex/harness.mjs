#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, readlinkSync, symlinkSync, unlinkSync, realpathSync } from "node:fs";
import { dirname, resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const workspace = existsSync(join(repo, "../CLAUDE.md")) ? dirname(repo) : repo;
const read = (path) => readFileSync(path, "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const q = (value) => JSON.stringify(value);
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const state = join(repo, ".codex/state");

function readPrivateJson(path) {
  try { return JSON.parse(read(path)); }
  catch { throw new Error(`Cannot read MCP configuration as JSON: ${path}`); }
}

export function run(command, args, cwd = repo, options = {}) {
  return spawnSync(command, args, { cwd, encoding: "utf8", ...options });
}

// pnpm is pinned by packageManager and normally reached through corepack.
export function packageManager() {
  if (run("pnpm", ["--version"], repo).status === 0) return { command: "pnpm", prefix: [] };
  if (run("corepack", ["pnpm", "--version"], repo).status === 0) return { command: "corepack", prefix: ["pnpm"] };
  return null;
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path) || read(path) !== value) writeFileSync(path, value);
}

function link(path, target) {
  if (existsSync(path) || (() => { try { return lstatSync(path).isSymbolicLink(); } catch { return false; } })()) {
    if (!lstatSync(path).isSymbolicLink() || readlinkSync(path) !== target) throw new Error(`Refusing to replace existing path: ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
}

export function sources() {
  const paths = [".claude/settings.json", ".claude/settings.local.json"];
  const walk = (dir) => {
    if (!existsSync(join(repo, dir))) return;
    for (const entry of readdirSync(join(repo, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else paths.push(path);
    }
  };
  walk("scripts/codex");
  walk(".claude/skills");
  if (workspace !== repo) {
    paths.push("../CLAUDE.md", "../.claude/settings.json", "../.claude/settings.local.json");
    walk("../expert_info/lms");
  }
  return Object.fromEntries(paths.filter(p => existsSync(join(repo, p))).sort().map(p => [p, hash(read(join(repo, p)))]));
}

export function projectSkills() {
  return [...new Set([...readdirSync(join(repo, ".claude/skills")), "frontend-design", "project-harness"])].sort();
}

export function configuredServers() {
  const result = {};
  const claudeConfig = join(homedir(), ".claude.json");
  if (existsSync(claudeConfig)) {
    const webstorm = readPrivateJson(claudeConfig).mcpServers?.webstorm;
    if (webstorm) result.webstorm = { ...webstorm, source: claudeConfig };
  }
  for (const path of new Set([join(workspace, ".mcp.json"), join(repo, ".mcp.json"), join(repo, ".codex/mcp.local.json")])) {
    if (!existsSync(path)) continue;
    for (const [name, definition] of Object.entries(readPrivateJson(path).mcpServers ?? {})) {
      result[name] = { ...definition, source: path };
    }
  }
  return result;
}

export function configText() {
  let config = read(join(repo, "scripts/codex/config.template.toml"));
  config += `\n[permissions.lms.workspace_roots]\n${q(workspace)} = true\n`;
  // pnpm/npm/npx keep their caches inside the authorized workspace.
  config += `\n[shell_environment_policy.set]\nnpm_config_cache = ${q(join(state, "npm-cache"))}\nPNPM_HOME = ${q(join(state, "pnpm-home"))}\n`;
  for (const [name, server] of Object.entries(configuredServers())) {
    config += `\n[mcp_servers.${q(name)}]\nenabled = true\nstartup_timeout_sec = 60\ntool_timeout_sec = 120\ndefault_tools_approval_mode = "approve"\n`;
    if (server.type === "http" || server.type === "sse" || server.url) {
      config += `url = ${q(server.url)}\n`;
      if (server.headers && Object.keys(server.headers).length) {
        config += `http_headers_helper = ${q([process.execPath, join(repo, "scripts/codex/mcp.mjs"), "headers", name].map(shellQuote).join(" "))}\n`;
      }
    } else {
      config += `command = ${q(process.execPath)}\nargs = ${q([join(repo, "scripts/codex/mcp.mjs"), "serve", name])}\ncwd = ${q(repo)}\n`;
    }
  }
  // Native SessionStart also runs after compaction. One source per config layer.
  for (const event of ["SessionStart", "Stop"]) {
    config += `\n[[hooks.${event}]]\n[[hooks.${event}.hooks]]\ntype = "command"\ncommand = ${q([process.execPath, join(repo, "scripts/codex/hooks.mjs")].map(shellQuote).join(" "))}\ntimeout = 30\n`;
  }
  return config;
}

// Roles live as Claude subagent definitions; the committed copy is the fallback
// when the external expert_info directory is absent in a standalone checkout.
export function agentSpecs() {
  const agents = {};
  for (const dir of [join(repo, ".codex/context/lms/agents"), join(workspace, "expert_info/lms/agents")]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(name => name.endsWith(".md"))) {
      const text = read(join(dir, file));
      const front = text.match(/^---\n([\s\S]*?)\n---\s*/);
      if (!front) throw new Error(`Role definition without frontmatter: ${file}`);
      const field = (key) => front[1].match(new RegExp(`^${key}: (.+)$`, "m"))?.[1]?.trim();
      const name = field("name") ?? file.replace(/\.md$/, "");
      const description = field("description");
      if (!description) throw new Error(`Role definition without description: ${file}`);
      agents[name] = {
        description,
        tools: (field("tools") ?? "Read, Grep, Glob").split(",").map(tool => tool.trim()).filter(Boolean),
        prompt: text.slice(front[0].length),
      };
    }
  }
  if (!Object.keys(agents).length) throw new Error("No role definitions found in expert_info/lms/agents or .codex/context/lms/agents");
  return agents;
}

const adaptations = {
  "deploy-check": "Команды выполняй через pnpm из корня репозитория app: pnpm smoke — это lint, typecheck, test и build. pnpm codex:verify дополнительно проверяет сам harness и сборку лендинга. Сборка требует переменных окружения Payload (DATABASE_URL, PAYLOAD_SECRET): при их отсутствии отметь пропуск явно, не выдавай его за успех. Docker build выполняй при изменениях Docker/deploy и доступном daemon. Право на push владелец дал в CLAUDE.md; push в main запускает выкат Dokploy.",
  "prod-check": "SSH-доступ бери из существующего окружения пользователя. Файл expert_info/ssh_access.txt может отсутствовать в этом рабочем каталоге: тогда используй уже настроенный ключ и не проси пароль. Не копируй пароли, DATABASE_URL и содержимое .env в память, отчёты и новые файлы — проверяй наличие и структуру с редактированием секретов. Имена контейнеров и compose-каталог находи динамически: хеш в lms-mentor-3ghbnk меняется при пересоздании. Любое изменение прода — только с подтверждением пользователя.",
  "self-review": "Полные правила проекта — .codex/context/CLAUDE.md (копия ../CLAUDE.md). Проверки запускай как pnpm lint, pnpm typecheck, pnpm test. Не выдумывай улучшения ради числа: исправляй подтверждённые дефекты, остальное перечисли как наблюдения. Изменения в хуках Payload, access-политиках и миграциях проверяй отдельно — они не покрываются типами.",
};

export function sync() {
  const previousManifest = join(repo, ".codex/generated.json");
  const previous = existsSync(previousManifest) ? JSON.parse(read(previousManifest)) : {};
  const generated = [];
  const generate = (path, value) => { write(join(repo, path), value); generated.push(path); };
  if (workspace !== repo) {
    generate(".codex/context/CLAUDE.md", read(join(workspace, "CLAUDE.md")));
    for (const path of Object.keys(sources()).filter(p => p.startsWith("../expert_info/lms/") && p.endsWith(".md"))) {
      generate(join(".codex/context/lms", path.slice("../expert_info/lms/".length)), read(join(repo, path)));
    }
  }
  // A standalone checkout uses the committed context when external originals
  // are absent. Keep checking those copies after every sync as well.
  const collectContext = (dir) => {
    for (const entry of readdirSync(join(repo, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) collectContext(path);
      else if (!generated.includes(path)) generated.push(path);
    }
  };
  collectContext(".codex/context");
  for (const name of readdirSync(join(repo, ".claude/skills"))) {
    const original = read(join(repo, `.claude/skills/${name}/SKILL.md`));
    const description = original.match(/^description: (.+)$/m)?.[1];
    if (!description) throw new Error(`Missing skill description: ${name}`);
    generate(`.agents/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${q(description.replaceAll("claude-in-chrome", "Chrome DevTools MCP"))}\n---\n\nПрочитай [оригинальный workflow](../../../.claude/skills/${name}/SKILL.md) целиком и выполни его с адаптацией ниже. Пути src/, tests/, landing/ и команды pnpm/git относятся к корню репозитория app. $ARGUMENTS означает запрос пользователя, не shell-переменную.\n\n${adaptations[name] ?? "Соблюдай AGENTS.md и используй доступные инструменты Codex."}\n`);
  }
  for (const [name, spec] of Object.entries(agentSpecs())) {
    const readOnly = !spec.tools.includes("Bash");
    const instructions = `${spec.prompt}\n\nПроектные правила: AGENTS.md и .codex/context/CLAUDE.md. Команды выполнять из репозитория app через pnpm. ${readOnly ? "Только исследование: не редактируй файлы и не вызывай изменяющие MCP-инструменты." : "Запускай только согласованные проверки, не редактируй исходники."}`;
    generate(`.codex/agents/${name}.toml`, `name = ${q(name)}\ndescription = ${q(spec.description)}\ndeveloper_instructions = ${q(instructions)}\n${readOnly ? 'default_permissions = "lms-review"\n' : ""}`);
  }
  // Retire only files that this generator owns and that nobody edited locally.
  // Custom roles/skills and fallback context must remain untouched.
  const retired = Object.entries(previous).filter(([path]) => !generated.includes(path)
    && /^(?:\.codex\/agents\/[a-z][a-z0-9-]*\.toml|\.agents\/skills\/[a-z][a-z0-9-]*\/SKILL\.md)$/.test(path));
  for (const [path, digest] of retired) {
    const file = join(repo, path);
    if (!existsSync(file)) continue;
    const parent = relative(realpathSync(repo), realpathSync(dirname(file)));
    if (parent.startsWith("..") || lstatSync(file).isSymbolicLink() || hash(read(file)) !== digest) {
      throw new Error(`Retired generated file has local changes; preserve or relocate it before sync: ${path}`);
    }
  }
  for (const [path] of retired) if (existsSync(join(repo, path))) unlinkSync(join(repo, path));
  write(join(repo, ".codex/config.toml"), configText());
  if (workspace !== repo) {
    write(join(workspace, ".codex/config.toml"), configText());
    link(join(workspace, "AGENTS.md"), "app/AGENTS.md");
    link(join(workspace, ".agents/skills"), "../app/.agents/skills");
    link(join(workspace, ".codex/agents"), "../app/.codex/agents");
    link(join(workspace, ".codex/memory"), "../app/.codex/memory");
    link(join(workspace, ".codex/context"), "../app/.codex/context");
  }
  write(join(repo, ".codex/sources.json"), JSON.stringify(sources(), null, 2) + "\n");
  write(join(repo, ".codex/generated.json"), JSON.stringify(Object.fromEntries(generated.sort().map(path => [path, hash(read(join(repo, path)))])), null, 2) + "\n");
  console.log("Codex project configuration, skills, roles and context synchronized.");
}

export function doctor() {
  const failures = [];
  const check = (ok, label) => { if (!ok) failures.push(label); };
  const manifest = join(repo, ".codex/sources.json");
  check(existsSync(manifest) && read(manifest) === JSON.stringify(sources(), null, 2) + "\n", "Claude sources changed: run pnpm codex:sync");
  const generated = join(repo, ".codex/generated.json");
  check(existsSync(generated), "Generated manifest missing: run pnpm codex:sync");
  if (existsSync(generated)) for (const [path, digest] of Object.entries(JSON.parse(read(generated)))) check(existsSync(join(repo, path)) && hash(read(join(repo, path))) === digest, `Generated file drift: ${path}`);
  for (const root of new Set([repo, workspace])) check(existsSync(join(root, ".codex/config.toml")) && read(join(root, ".codex/config.toml")) === configText(), `Config drift: ${root}`);
  for (const name of projectSkills()) {
    const path = join(repo, `.agents/skills/${name}/SKILL.md`);
    check(existsSync(path), `Missing skill: ${name}`);
    if (!existsSync(path)) continue;
    for (const match of read(path).matchAll(/\]\(([^\s)#]+)(?:#[^\s)]*)?\)/g)) {
      if (/^[a-z][a-z\d+.-]*:/i.test(match[1])) continue;
      check(existsSync(resolve(dirname(path), match[1])), `Broken skill reference: ${name}: ${match[1]}`);
    }
  }
  if (workspace !== repo) {
    for (const [path, target] of Object.entries({ "AGENTS.md": "app/AGENTS.md", ".agents/skills": "../app/.agents/skills", ".codex/agents": "../app/.codex/agents", ".codex/memory": "../app/.codex/memory", ".codex/context": "../app/.codex/context" })) {
      const full = join(workspace, path);
      check(existsSync(full) && lstatSync(full).isSymbolicLink() && readlinkSync(full) === target, `Workspace link drift: ${path}`);
    }
  }
  for (const name of Object.keys(agentSpecs())) check(existsSync(join(repo, `.codex/agents/${name}.toml`)), `Missing agent: ${name}`);
  for (const path of ["AGENTS.md", ".codex/memory/MEMORY.md", ".codex/context/CLAUDE.md"]) check(existsSync(join(repo, path)), `Missing ${path}`);
  for (const pkg of [".", "landing"]) check(existsSync(join(repo, pkg, "node_modules")), `Install dependencies: ${pkg}`);
  check(packageManager() !== null, "pnpm is unavailable: enable corepack or install pnpm");
  check(Number(process.versions.node.split(".")[0]) >= 22, "Node >= 22 required");
  return failures;
}

// The landing page is a separate npm package with its own lockfile.
export function verificationPlan() {
  return [
    { cwd: ".", manager: "pnpm", script: "codex:test" },
    { cwd: ".", manager: "pnpm", script: "lint" },
    { cwd: ".", manager: "pnpm", script: "typecheck" },
    { cwd: ".", manager: "pnpm", script: "test" },
    { cwd: ".", manager: "pnpm", script: "build" },
    { cwd: "landing", manager: "npm", script: "build" },
  ];
}

function verify() {
  const failures = doctor();
  if (failures.length) throw new Error(failures.join("\n"));
  const pnpm = packageManager();
  const report = { timestamp: new Date().toISOString(), checks: [] };
  mkdirSync(state, { recursive: true });
  for (const { cwd, manager, script } of verificationPlan()) {
    console.log(`Checking ${cwd}: ${manager} run ${script}`);
    const spec = manager === "pnpm" ? { command: pnpm.command, args: [...pnpm.prefix, "run", script] } : { command: "npm", args: ["run", script] };
    const result = run(spec.command, spec.args, join(repo, cwd), { maxBuffer: 20 * 1024 * 1024 });
    const logfile = join(state, `${cwd === "." ? "app" : cwd}-${script.replaceAll(":", "-")}.log`);
    write(logfile, (result.stdout ?? "") + (result.stderr ?? ""));
    report.checks.push({ cwd, script, status: result.status, log: relative(repo, logfile) });
    write(join(state, "verification.json"), JSON.stringify(report, null, 2) + "\n");
    if (result.status !== 0) { console.error(`FAILED: ${relative(repo, logfile)}`); process.exitCode = 1; return; }
    console.log("PASS");
  }
}

function launch(args) {
  const failures = doctor();
  if (failures.length) throw new Error(failures.join("\n"));
  const result = run("codex", ["-C", workspace, ...args], workspace, { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === "sync") sync();
    else if (command === "doctor") {
      const failures = doctor();
      console.log(failures.length ? failures.join("\n") : `PASS: project context, ${projectSkills().length} skills, ${Object.keys(agentSpecs()).length} roles, hooks, dependencies and ${Object.keys(configuredServers()).length} MCP definitions`);
      process.exitCode = failures.length ? 1 : 0;
    } else if (command === "verify") verify();
    else if (command === "launch") launch(args);
    else throw new Error("Usage: harness.mjs sync|doctor|verify|launch [codex arguments]");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
