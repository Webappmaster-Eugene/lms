#!/usr/bin/env node
// Inspect the installed Codex runtime without starting a model turn.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { repo, workspace, configuredServers, projectSkills } from "./harness.mjs";
import { validateNativeReport } from "./native-report.mjs";
import { stopChild } from "./process.mjs";

const child = spawn("codex", ["app-server", "--stdio", "--strict-config"], { cwd: workspace, stdio: ["pipe", "pipe", "pipe"] });
const pending = new Map();
let sequence = 0;
child.stderr.on("data", () => {});
child.stdin.on("error", error => { for (const entry of pending.values()) entry.reject(error); });
child.on("error", error => { for (const entry of pending.values()) entry.reject(error); });
child.on("exit", () => { for (const entry of pending.values()) entry.reject(new Error("Codex app-server exited")); });
createInterface({ input: child.stdout }).on("line", line => {
  try {
    const message = JSON.parse(line);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  } catch { /* Ignore non-protocol output. */ }
});

async function rpc(method, params) {
  const id = ++sequence;
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 60000);
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  } finally { clearTimeout(timer); pending.delete(id); }
}

const report = { timestamp: new Date().toISOString(), configs: [], skills: [], hooks: [], mcp: [], failures: ["Native check did not complete"] };
try {
  await rpc("initialize", { clientInfo: { name: "lms_native_check", version: "1.0.0" }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
  const cwds = [...new Set([workspace, repo])];
  for (const cwd of cwds) {
    const result = await rpc("config/read", { cwd, includeLayers: true });
    report.configs.push({ cwd, approval: result.config.approval_policy, permissions: result.config.default_permissions, mcp: Object.entries(result.config.mcp_servers ?? {}).filter(([, server]) => server.enabled !== false).map(([name]) => name), layers: result.layers?.map(layer => ({ name: layer.name, disabledReason: layer.disabledReason })) });
  }
  const skills = await rpc("skills/list", { cwds, forceReload: true });
  report.skills = skills.data?.map(item => ({ cwd: item.cwd, errors: item.errors, skills: item.skills.filter(skill => {
    const path = relative(workspace, skill.path);
    return !isAbsolute(path) && path !== ".." && !path.startsWith("../");
  }).map(skill => ({ name: skill.name, enabled: skill.enabled })) }));
  const hooks = await rpc("hooks/list", { cwds });
  report.hooks = hooks;
  let cursor;
  const seenCursors = new Set();
  do {
    const mcp = await rpc("mcpServerStatus/list", { detail: "toolsAndAuthOnly", ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(mcp.data)) throw new Error("Missing MCP status inventory");
    report.mcp.push(...mcp.data.map(server => ({ name: server.name, authStatus: server.authStatus, tools: Object.keys(server.tools ?? {}).length })));
    cursor = mcp.nextCursor;
    if (cursor && seenCursors.has(cursor)) throw new Error("Repeated MCP inventory cursor");
    seenCursors.add(cursor);
  } while (cursor);
  report.failures = validateNativeReport(report, { cwds, skills: projectSkills(), servers: Object.keys(configuredServers()) });
  console.log(JSON.stringify({
    configs: report.configs.map(({ cwd, approval, permissions, mcp }) => ({ cwd, approval, permissions, mcp })),
    skills: report.skills,
    hooks: report.hooks.data?.map(item => ({ cwd: item.cwd, hooks: item.hooks.map(hook => ({ event: hook.eventName, enabled: hook.enabled, trust: hook.trustStatus })), errors: item.errors })),
    mcp: report.mcp,
    failures: report.failures,
  }, null, 2));
  if (report.failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  // Do not leave an earlier successful report after a failed connection.
  // RPC errors can include third-party data, so persist only a fixed message.
  report.failures = ["Native check failed before inventory validation; inspect the command output"];
  process.exitCode = 1;
} finally {
  await stopChild(child);
  mkdirSync(join(repo, ".codex/state"), { recursive: true });
  writeFileSync(join(repo, ".codex/state/native-report.json"), JSON.stringify(report, null, 2) + "\n");
}
