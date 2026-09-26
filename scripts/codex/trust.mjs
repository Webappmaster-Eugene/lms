#!/usr/bin/env node
// Codex keeps hook trust only in the user config (~/.codex/config.toml,
// [hooks.state]); a project cannot trust itself. This writes exactly the
// entries the trust dialog would write, through Codex's own config API, and
// only for this harness's hooks in this checkout's config files.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repo, workspace } from "./harness.mjs";
import { openAppServer } from "./app-server.mjs";

export function hooksToTrust(inventory, { configs, script }) {
  return (inventory.data ?? []).flatMap(item => item.hooks ?? [])
    .filter(hook => hook.source === "project" && configs.includes(hook.sourcePath)
      && typeof hook.command === "string" && hook.command.includes(script)
      && hook.trustStatus !== "trusted" && /^sha256:[0-9a-f]{64}$/.test(hook.currentHash ?? ""));
}

export async function trustProjectHooks() {
  const cwds = [...new Set([workspace, repo])];
  const expected = { configs: cwds.map(cwd => join(cwd, ".codex/config.toml")), script: join(repo, "scripts/codex/hooks.mjs") };
  const server = await openAppServer(workspace, "lms_hook_trust");
  try {
    const pendingTrust = hooksToTrust(await server.rpc("hooks/list", { cwds }), expected);
    const unique = new Map(pendingTrust.map(hook => [hook.key, hook.currentHash]));
    if (unique.size) {
      const value = Object.fromEntries([...unique].map(([key, digest]) => [key, { trusted_hash: digest }]));
      await server.rpc("config/batchWrite", { edits: [{ keyPath: "hooks.state", value, mergeStrategy: "upsert" }] });
    }
    const after = await server.rpc("hooks/list", { cwds });
    const hooks = (after.data ?? []).flatMap(item => item.hooks ?? []).filter(hook => expected.configs.includes(hook.sourcePath));
    const untrusted = hooks.filter(hook => hook.trustStatus !== "trusted");
    if (!hooks.length) throw new Error("Codex did not load any project hooks; run pnpm codex:sync");
    if (untrusted.length) throw new Error(`Hooks remain untrusted: ${untrusted.map(hook => hook.key).join(", ")}`);
    return { trusted: unique.size, total: hooks.length };
  } finally { await server.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { trusted, total } = await trustProjectHooks();
    console.log(`Project hooks trusted: ${total} loaded, ${trusted} newly trusted.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
