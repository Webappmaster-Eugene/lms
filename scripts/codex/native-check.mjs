#!/usr/bin/env node
// Inspect the installed Codex runtime without starting a model turn.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { repo, configRoots, configuredServers, projectSkills } from "./harness.mjs";
import { mcpInventory, validateNativeReport } from "./native-report.mjs";
import { openAppServer } from "./app-server.mjs";

const report = { timestamp: new Date().toISOString(), configs: [], skills: [], hooks: [], mcp: [], failures: ["Native check did not complete"] };
let server;
try {
  server = await openAppServer(configRoots[0], "lms_native_check");
  const { rpc } = server;
  const cwds = configRoots;
  for (const cwd of cwds) {
    const result = await rpc("config/read", { cwd, includeLayers: true });
    report.configs.push({ cwd, approval: result.config.approval_policy, permissions: result.config.default_permissions, contextWindow: result.config.model_context_window, autoCompactLimit: result.config.model_auto_compact_token_limit, mcp: Object.entries(result.config.mcp_servers ?? {}).filter(([, server]) => server.enabled !== false).map(([name]) => name), layers: result.layers?.map(layer => ({ name: layer.name, disabledReason: layer.disabledReason })) });
  }
  const skills = await rpc("skills/list", { cwds, forceReload: true });
  report.skills = skills.data?.map(item => ({ cwd: item.cwd, errors: item.errors, skills: item.skills.filter(skill => {
    const path = relative(repo, skill.path);
    return !isAbsolute(path) && path !== ".." && !path.startsWith("../");
  }).map(skill => ({ name: skill.name, enabled: skill.enabled })) }));
  const hooks = await rpc("hooks/list", { cwds });
  report.hooks = hooks;
  for (const cwd of cwds) report.mcp.push(await mcpInventory(rpc, cwd));
  report.failures = validateNativeReport(report, { cwds, skills: projectSkills(), servers: Object.keys(configuredServers()) });
  console.log(JSON.stringify({
    configs: report.configs.map(({ cwd, approval, permissions, contextWindow, autoCompactLimit, mcp }) => ({ cwd, approval, permissions, contextWindow, autoCompactLimit, mcp })),
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
  await server?.close();
  mkdirSync(join(repo, ".codex/state"), { recursive: true });
  writeFileSync(join(repo, ".codex/state/native-report.json"), JSON.stringify(report, null, 2) + "\n");
}
