import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { once } from "node:events";
import { serverCommand } from "./mcp.mjs";
import { handleEvent, deniedCommand, claudeDenyPatterns, claudeMemoryDir, claudeMemory, contextExcerpt } from "./hooks.mjs";
import { hooksToTrust } from "./trust.mjs";
import { configText, verificationPlan, configuredServers, repo } from "./harness.mjs";
import { mcpInventory, validateNativeReport } from "./native-report.mjs";
import { stopChild } from "./process.mjs";
import { startupFailure } from './app-server.mjs'

test('app-server startup diagnostics explain denied state access without exposing private stderr', () => {
  const privateMarker = 'fixture-private-credential'
  const denied = startupFailure(`Operation not permitted; failed to initialize sqlite state runtime under /private/user; ${privateMarker}`)
  assert.match(denied, /CODEX_HOME is not writable/)
  assert.ok(!denied.includes(privateMarker))
  assert.ok(!denied.includes('/private/user'))
  assert.ok(!startupFailure(`Unexpected startup error: ${privateMarker}`).includes(privateMarker))
})

test("stubborn child shutdown is bounded and reaped", { timeout: 5000 }, async () => {
  const child = spawn(process.execPath, ["-e", 'process.on("SIGTERM",()=>{});process.stdout.write("ready");setInterval(()=>{},1000);'], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await once(child.stdout, "data");
    await stopChild(child, "SIGTERM", 50);
    assert.equal(child.signalCode, "SIGKILL");
    await stopChild(child); // Closing an exited child must also settle.
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
});

test("MCP credentials reach only the child environment; caller environment is unchanged", () => {
  const env = { PATH: "/bin", TOKEN: "outer" };
  const command = serverCommand("github", { command: "node", args: ["server.js"], env: { TOKEN: "private-value" } }, env);
  assert.equal(command.env.TOKEN, "private-value");
  assert.equal(env.TOKEN, "outer");
  assert.deepEqual(command.args, ["server.js"]);
  assert.ok(!command.args.includes("private-value"));
});

test("Claude-specific Chrome package gets a real existing-browser adapter", () => {
  const command = serverCommand("chrome-devtools", { command: "npx", args: ["-y", "@anthropic-ai/mcp-chrome-devtools@latest"] });
  assert.equal(command.command, "npx");
  assert.ok(command.args.includes("--autoConnect"));
  assert.ok(command.args.includes("chrome-devtools-mcp@latest"));
});

test("a user-supplied alternative Chrome command remains untouched", () => {
  const command = serverCommand("chrome-devtools", { command: "/custom/server", args: ["--port", "1234"] });
  assert.equal(command.command, "/custom/server");
  assert.deepEqual(command.args, ["--port", "1234"]);
});

test("generated Codex configuration does not serialize source MCP credentials", () => {
  const config = configText();
  for (const server of Object.values(configuredServers())) {
    for (const value of [...Object.values(server.env ?? {}), ...Object.values(server.headers ?? {})]) {
      if (typeof value === "string" && value.length >= 8) assert.ok(!config.includes(value));
    }
  }
});

test("SessionStart restores memory without reading the conversation transcript", () => {
  const result = handleEvent({ hook_event_name: "SessionStart", transcript_path: "/nonexistent/private-transcript" });
  assert.equal(result.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(result.hookSpecificOutput.additionalContext, /AGENTS\.md/);
});

test('live Claude memory restores its index without injecting unrelated topic contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lms-memory-index-'))
  try {
    writeFileSync(join(dir, 'MEMORY.md'), 'Current facts. Read [media](media.md) when needed.\n')
    writeFileSync(join(dir, 'media.md'), 'Large historical topic that should not be loaded on every turn.\n')
    const first = claudeMemory(dir)
    assert.ok(first.includes('[media](media.md)'))
    assert.ok(!first.includes('Large historical topic'))
    writeFileSync(join(dir, 'MEMORY.md'), 'Fresh index fact.\n')
    assert.ok(claudeMemory(dir).includes('Fresh index fact.'))
    rmSync(join(dir, 'MEMORY.md'))
    assert.ok(claudeMemory(dir).includes('Large historical topic'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('context truncation keeps complete paragraphs and points to the full source', () => {
  const text = 'Important first paragraph.\n\n' + 'Long second paragraph. '.repeat(100)
  const excerpt = contextExcerpt(text, 140, '/project/memory.md')
  assert.ok(excerpt.startsWith('Important first paragraph.\n\n['))
  assert.ok(excerpt.includes('/project/memory.md'))
  assert.ok(!excerpt.includes('Long second paragraph.'))
  assert.ok(excerpt.length <= 140)
  assert.equal(contextExcerpt('Short text', 140, '/project/memory.md'), 'Short text')
})

test("Stop continuation is bounded even when checks keep failing", () => {
  const result = handleEvent({ hook_event_name: "Stop", stop_hook_active: true });
  assert.notEqual(result.decision, "block");
});

test("PreToolUse applies Claude deny rules to every shell segment, including nested shells", () => {
  const patterns = ["sudo *", "git reset --hard*", "git clean*", "rm -rf ~/.ssh*", "rm -rf /usr*", "dd *"];
  for (const command of [
    "sudo ls",
    "pnpm lint && git reset --hard HEAD~1",
    "git -C app clean -fdx",
    "cd app; env FOO=1 git reset --hard",
    'bash -lc "git clean -fd"',
    "rm -rf $HOME/.ssh/keys",
    "rm -rf /home/me/.ssh",
    "echo $(dd if=/dev/zero of=/tmp/x)",
  ]) assert.ok(deniedCommand(command, patterns, "/home/me"), command);
  for (const command of ["git reset --soft HEAD~1", "git status", "rm -rf node_modules/.cache", "pnpm add dd-trace", "echo sudo"]) {
    assert.equal(deniedCommand(command, patterns, "/home/me"), null, command);
  }
});

test("PreToolUse denies through the Codex hook protocol and ignores non-shell tools", () => {
  const denied = handleEvent({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: ["bash", "-lc", "git reset --hard"] } });
  assert.equal(denied.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, /git reset --hard/);
  assert.deepEqual(handleEvent({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "pnpm test" } }), {});
  assert.deepEqual(handleEvent({ hook_event_name: "PreToolUse", tool_name: "apply_patch", tool_input: { patch: "*** Begin Patch" } }), {});
});

test("Claude deny rules are read from settings files, with a fallback when none exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "lms-deny-"));
  try {
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ permissions: { deny: ["Bash(terraform destroy:*)", "Read(./.env)"] } }));
    const patterns = claudeDenyPatterns([file, join(dir, "missing.json")]);
    assert.ok(patterns.includes("terraform destroy*"));
    assert.ok(patterns.includes("git reset --hard*"));
    assert.ok(!patterns.some(pattern => pattern.includes(".env")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Claude auto-memory directory follows Claude's project slug", () => {
  assert.match(claudeMemoryDir("/home/me"), /^\/home\/me\/\.claude\/projects\/-[A-Za-z0-9-]+\/memory$/);
});

test("hook trust targets only this harness's untrusted hooks in project configs", () => {
  const hook = (overrides) => ({ key: "k", source: "project", sourcePath: "/p/.codex/config.toml", command: "node /p/app/scripts/codex/hooks.mjs", trustStatus: "untrusted", currentHash: `sha256:${"a".repeat(64)}`, ...overrides });
  const inventory = { data: [{ hooks: [
    hook({ key: "ours" }),
    hook({ key: "trusted", trustStatus: "trusted" }),
    hook({ key: "foreign", command: "curl evil" }),
    hook({ key: "user", source: "user" }),
    hook({ key: "elsewhere", sourcePath: "/other/.codex/config.toml" }),
    hook({ key: "nohash", currentHash: null }),
  ] }] };
  const keys = hooksToTrust(inventory, { configs: ["/p/.codex/config.toml"], script: "/p/app/scripts/codex/hooks.mjs" }).map(item => item.key);
  assert.deepEqual(keys, ["ours"]);
});

test("verification covers the harness, the app quality gate and the separate landing package", () => {
  const plan = verificationPlan();
  for (const needed of [
    { cwd: ".", manager: "pnpm", script: "codex:test" },
    { cwd: ".", manager: "pnpm", script: "lint" },
    { cwd: ".", manager: "pnpm", script: "typecheck" },
    { cwd: ".", manager: "pnpm", script: "test" },
    { cwd: ".", manager: "pnpm", script: "build" },
    { cwd: "landing", manager: "npm", script: "build" },
  ]) {
    assert.ok(plan.some(item => JSON.stringify(item) === JSON.stringify(needed)), `${JSON.stringify(needed)} absent`);
  }
});

const nativeExpected = { cwds: ["/project", "/project/app"], skills: ["self-review", "project-harness"], servers: ["context7"] };
function nativeFixture() {
  return {
    configs: nativeExpected.cwds.map(cwd => ({ cwd, approval: "never", permissions: "lms", contextWindow: 600000, autoCompactLimit: 540000, mcp: ["context7"] })),
    skills: nativeExpected.cwds.map(cwd => ({ cwd, errors: [], skills: nativeExpected.skills.map(name => ({ name, enabled: true })) })),
    hooks: { data: nativeExpected.cwds.map(cwd => ({ cwd, errors: [], hooks: ["sessionStart", "preToolUse", "stop"].map(eventName => ({ eventName, enabled: true, trustStatus: "trusted" })) })) },
    mcp: nativeExpected.cwds.map(cwd => ({ cwd, servers: [{ name: "context7", tools: 2 }] })),
  };
}

test("native check accepts complete inventories for both project roots", () => {
  assert.deepEqual(validateNativeReport(nativeFixture(), nativeExpected), []);
});

test("native check rejects missing, disabled and untrusted capabilities", () => {
  const corruptions = [
    report => { delete report.configs; },
    report => { report.configs[1].mcp = []; },
    report => { report.configs[0].approval = "on-request"; },
    report => { report.configs[0].permissions = "workspace-write"; },
    report => { report.configs[0].contextWindow = 272000; },
    report => { delete report.configs[1].autoCompactLimit; },
    report => { delete report.skills; },
    report => { report.skills = []; },
    report => { report.skills.pop(); },
    report => { report.skills[0].skills = []; },
    report => { report.skills[0].skills[0].enabled = false; },
    report => { report.skills[0].errors.push({ message: "invalid skill" }); },
    report => { delete report.hooks; },
    report => { report.hooks.data = []; },
    report => { report.hooks.data[1].hooks.pop(); },
    report => { report.hooks.data[0].hooks[0].enabled = false; },
    report => { report.hooks.data[0].hooks[0].trustStatus = "untrusted"; },
    report => { report.hooks.data[0].hooks[1].eventName = "sessionStart"; },
    report => { report.mcp[0].servers[0].tools = 0; },
    report => { report.mcp.pop(); },
    // An inventory without a project root is the app-server's own list, not the project's.
    report => { report.mcp = [{ name: "context7", tools: 2 }]; },
  ];
  for (const corrupt of corruptions) {
    const report = nativeFixture();
    corrupt(report);
    assert.ok(validateNativeReport(report, nativeExpected).length > 0, corrupt.toString());
  }
});

test("native check reads MCP status inside an ephemeral thread of the project root", async () => {
  const calls = [];
  const pages = { first: { data: [{ name: "context7", tools: { a: {}, b: {} } }], nextCursor: "next" }, next: { data: [{ name: "playwright", authStatus: "unsupported" }] } };
  const rpc = async (method, params) => {
    calls.push({ method, params });
    return method === "thread/start" ? { thread: { id: "t1" } } : pages[params.cursor ?? "first"];
  };
  assert.deepEqual(await mcpInventory(rpc, "/project"), { cwd: "/project", servers: [
    { name: "context7", authStatus: undefined, tools: 2 },
    { name: "playwright", authStatus: "unsupported", tools: 0 },
  ] });
  assert.deepEqual(calls[0], { method: "thread/start", params: { cwd: "/project", ephemeral: true } });
  assert.ok(calls.slice(1).every(call => call.method === "mcpServerStatus/list" && call.params.threadId === "t1"));
  assert.equal(calls.length, 3);
});

test("native check fails instead of guessing when the MCP inventory is unusable", async () => {
  await assert.rejects(mcpInventory(async () => ({}), "/project"), /inspection thread/);
  const looping = async method => method === "thread/start" ? { thread: { id: "t1" } } : { data: [], nextCursor: "same" };
  await assert.rejects(mcpInventory(looping, "/project"), /Repeated MCP inventory cursor/);
  const empty = async method => method === "thread/start" ? { thread: { id: "t1" } } : {};
  await assert.rejects(mcpInventory(empty, "/project"), /Missing MCP status inventory/);
});

test('sibling checkout sync preserves the shared workspace configuration and instructions', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'lms-harness-worktree-'))
  const checkout = join(sandbox, 'feature-worktree')
  try {
    mkdirSync(checkout)
    for (const path of ['scripts/codex', '.claude/skills', '.agents', '.codex/context', '.codex/memory', 'AGENTS.md', 'package.json']) {
      cpSync(join(repo, path), join(checkout, path), { recursive: true })
    }
    mkdirSync(join(sandbox, '.codex'))
    writeFileSync(join(sandbox, 'CLAUDE.md'), 'Shared source instructions\n')
    writeFileSync(join(sandbox, 'AGENTS.md'), 'Shared workspace entry point\n')
    writeFileSync(join(sandbox, '.codex/config.toml'), '# Shared canonical configuration\n')
    writeFileSync(join(sandbox, '.mcp.json'), JSON.stringify({ mcpServers: { shared: { command: 'node' } } }))
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'import {sync,configuredServers} from "./scripts/codex/harness.mjs"; sync(); console.log(JSON.stringify({shared:!!configuredServers().shared}));'], { cwd: checkout, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(join(sandbox, '.codex/config.toml'), 'utf8'), '# Shared canonical configuration\n')
    assert.equal(readFileSync(join(sandbox, 'AGENTS.md'), 'utf8'), 'Shared workspace entry point\n')
    assert.equal(readFileSync(join(checkout, '.codex/context/CLAUDE.md'), 'utf8'), 'Shared source instructions\n')
    assert.ok(existsSync(join(checkout, '.codex/config.toml')))
    const summary = JSON.parse(result.stdout.trim().split('\n').at(-1))
    assert.deepEqual(summary, { shared: true })
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('canonical app checkout still synchronizes the parent entry point and shared config', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'lms-harness-canonical-'))
  const checkout = join(sandbox, 'app')
  try {
    mkdirSync(checkout)
    for (const path of ['scripts/codex', '.claude/skills', '.agents', '.codex/context', '.codex/memory', 'AGENTS.md', 'package.json']) {
      cpSync(join(repo, path), join(checkout, path), { recursive: true })
    }
    writeFileSync(join(sandbox, 'CLAUDE.md'), 'Shared canonical instructions\n')
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'import {sync} from "./scripts/codex/harness.mjs"; sync();'], { cwd: checkout, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(join(sandbox, '.codex/config.toml'), 'utf8'), readFileSync(join(checkout, '.codex/config.toml'), 'utf8'))
    assert.equal(readFileSync(join(sandbox, 'AGENTS.md'), 'utf8'), readFileSync(join(checkout, 'AGENTS.md'), 'utf8'))
    assert.equal(readFileSync(join(checkout, '.codex/context/CLAUDE.md'), 'utf8'), 'Shared canonical instructions\n')
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test("standalone setup preserves memory and detects context, source and skill drift", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "lms-harness-"));
  const checkout = join(sandbox, "checkout");
  const execute = (script) => spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: checkout, encoding: "utf8", timeout: 60000, env: { ...process.env, LMS_CODEX_SKIP_TRUST: "1" } });
  try {
    mkdirSync(checkout);
    for (const path of ["scripts/codex", ".claude/skills", ".agents", ".codex/context", ".codex/memory", "docs/CODEX.md", "AGENTS.md", "package.json"]) {
      cpSync(join(repo, path), join(checkout, path), { recursive: true });
    }
    for (const pkg of [".", "landing"]) {
      mkdirSync(join(checkout, pkg), { recursive: true });
      symlinkSync(join(repo, "node_modules"), join(checkout, pkg, "node_modules"), "dir");
    }
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: checkout }).status, 0);
    const memory = join(checkout, ".codex/memory/MEMORY.md");
    writeFileSync(memory, "Existing project facts must survive setup.\n");
    for (let i = 0; i < 2; i++) {
      const result = execute('await import("./scripts/codex/setup.mjs")');
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(readFileSync(memory, "utf8"), "Existing project facts must survive setup.\n");
    mkdirSync(join(checkout, ".codex/state"), { recursive: true });
    writeFileSync(join(checkout, ".codex/state/handoff.md"), "Unique unfinished task marker.\n");
    const restored = execute('import { handleEvent } from "./scripts/codex/hooks.mjs"; console.log(JSON.stringify(handleEvent({hook_event_name:"SessionStart"})));');
    assert.equal(restored.status, 0, restored.stderr);
    const context = JSON.parse(restored.stdout).hookSpecificOutput.additionalContext;
    assert.ok(context.includes("Existing project facts must survive setup."));
    assert.ok(context.includes("Unique unfinished task marker."));
    const diagnose = () => {
      const result = execute('import { doctor } from "./scripts/codex/harness.mjs"; console.log(JSON.stringify(doctor()));');
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    assert.deepEqual(diagnose(), []);
    const originalMemory = readFileSync(memory, 'utf8')
    writeFileSync(memory, 'Historical note. '.repeat(1100))
    assert.ok(diagnose().some(message => message.includes('Project memory exceeds SessionStart budget')))
    writeFileSync(memory, '[Missing topic](./missing-topic.md)\n')
    assert.ok(diagnose().some(message => message.includes('Broken memory reference')))
    writeFileSync(memory, originalMemory)
    // Removing a source must retire only unchanged generated files.
    const retiredRoleSource = join(checkout, ".codex/context/lms/agents/retired-example.md");
    writeFileSync(retiredRoleSource, "---\nname: retired-example\ndescription: Temporary fixture role\ntools: Read\n---\n\nFixture prompt.\n");
    mkdirSync(join(checkout, ".claude/skills/retired-example"));
    writeFileSync(join(checkout, ".claude/skills/retired-example/SKILL.md"), "---\nname: retired-example\ndescription: Temporary fixture skill\n---\n");
    const synchronize = () => execute('import { sync } from "./scripts/codex/harness.mjs"; sync();');
    assert.equal(synchronize().status, 0);
    const retiredRole = join(checkout, ".codex/agents/retired-example.toml");
    const retiredSkill = join(checkout, ".agents/skills/retired-example/SKILL.md");
    const generatedRole = readFileSync(retiredRole, "utf8");
    writeFileSync(retiredRole, generatedRole + "# Local customization\n");
    rmSync(retiredRoleSource);
    rmSync(join(checkout, ".claude/skills/retired-example"), { recursive: true });
    const conflict = synchronize();
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /Retired generated file has local changes/);
    assert.ok(readFileSync(retiredRole, "utf8").includes("Local customization"));
    writeFileSync(retiredRole, generatedRole);
    const customRole = join(checkout, ".codex/agents/custom-example.toml");
    writeFileSync(customRole, generatedRole.replaceAll("retired-example", "custom-example"));
    assert.equal(synchronize().status, 0);
    assert.equal(existsSync(retiredRole), false);
    assert.equal(existsSync(retiredSkill), false);
    assert.equal(existsSync(customRole), true);
    writeFileSync(join(checkout, ".mcp.json"), JSON.stringify({ mcpServers: { browser: { command: "original" }, other: { command: "retained" } } }));
    writeFileSync(join(checkout, ".codex/mcp.local.json"), JSON.stringify({ mcpServers: { browser: { command: "local-override" } } }));
    const overrides = execute('import { configuredServers } from "./scripts/codex/harness.mjs"; const s=configuredServers(); console.log(JSON.stringify({browser:s.browser.command,other:s.other.command}));');
    assert.equal(overrides.status, 0, overrides.stderr);
    assert.deepEqual(JSON.parse(overrides.stdout), { browser: "local-override", other: "retained" });
    const privateMarker = "fixture-private-credential-value";
    const mcpPath = join(checkout, ".codex/mcp.local.json");
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: {
      stdioSecret: { command: "node", env: { PRIVATE: privateMarker } },
      httpSecret: { url: "https://example.invalid/mcp", headers: { Authorization: privateMarker } },
    } }));
    const serialized = execute('import { configText } from "./scripts/codex/harness.mjs"; console.log(configText());');
    assert.equal(serialized.status, 0, serialized.stderr);
    assert.ok(!serialized.stdout.includes(privateMarker));
    writeFileSync(mcpPath, '{"mcpServers":' + privateMarker + '}');
    const malformed = execute('import { configuredServers } from "./scripts/codex/harness.mjs"; configuredServers();');
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /Cannot read MCP configuration as JSON/);
    assert.ok(!malformed.stderr.includes(privateMarker.slice(0, 12)));

    // A real, local JSON-RPC fixture verifies probe exit codes and stale reports.
    writeFileSync(join(checkout, ".codex/state/empty-mcp.mjs"), `
      import { createInterface } from "node:readline";
      createInterface({input:process.stdin}).on("line", line => {
        const req=JSON.parse(line);
        if(req.id===undefined) return;
        const result=req.method==="initialize"
          ? {protocolVersion:req.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:"empty",version:"1"}}
          : {tools:[]};
        process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:req.id,result})+"\\n");
      });
    `);
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: { empty: { command: process.execPath, args: [join(checkout, ".codex/state/empty-mcp.mjs")] } } }));
    const probe = name => spawnSync(process.execPath, ["scripts/codex/mcp.mjs", "probe", name], { cwd: checkout, encoding: "utf8", timeout: 30000 });
    const probeReport = join(checkout, ".codex/state/mcp-report.json");
    assert.equal(probe("empty").status, 1);
    assert.equal(JSON.parse(readFileSync(probeReport, "utf8")).servers[0].status, "unavailable");
    writeFileSync(probeReport, JSON.stringify({ servers: [{ name: "old", status: "connected" }] }));
    assert.equal(probe("nonexistent").status, 1);
    assert.deepEqual(JSON.parse(readFileSync(probeReport, "utf8")).servers, [{ name: "nonexistent", status: "unavailable" }]);
    rmSync(mcpPath);
    rmSync(join(checkout, ".mcp.json"));
    writeFileSync(join(checkout, ".codex/context/lms/conventions.md"), "corrupted\n");
    assert.ok(diagnose().some(message => message.includes("Generated file drift: .codex/context/lms/conventions.md")));
    writeFileSync(join(checkout, ".claude/skills/self-review/SKILL.md"), "---\nname: self-review\ndescription: changed\n---\n");
    assert.ok(diagnose().some(message => message.includes("Claude sources changed")));
    rmSync(join(checkout, ".agents/skills/frontend-design"), { recursive: true });
    assert.ok(diagnose().some(message => message.includes("Missing skill: frontend-design")));
    writeFileSync(join(checkout, ".agents/skills/project-harness/SKILL.md"), "[missing](./missing.md)\n");
    assert.ok(diagnose().some(message => message.includes('Broken skill project-harness reference')));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
