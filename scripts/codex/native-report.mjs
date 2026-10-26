// Project MCP servers start only inside a thread: without threadId the status
// lists just the app-server's own servers. An ephemeral thread keeps no rollout
// and starts no model turn.
export async function mcpInventory(rpc, cwd) {
  const { thread } = await rpc("thread/start", { cwd, ephemeral: true });
  if (!thread?.id) throw new Error("Codex did not start an inspection thread");
  const servers = [];
  let cursor;
  const seenCursors = new Set();
  do {
    const mcp = await rpc("mcpServerStatus/list", { threadId: thread.id, detail: "toolsAndAuthOnly", ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(mcp.data)) throw new Error("Missing MCP status inventory");
    servers.push(...mcp.data.map(server => ({ name: server.name, authStatus: server.authStatus, tools: Object.keys(server.tools ?? {}).length })));
    cursor = mcp.nextCursor;
    if (cursor && seenCursors.has(cursor)) throw new Error("Repeated MCP inventory cursor");
    seenCursors.add(cursor);
  } while (cursor);
  return { cwd, servers };
}

// Missing inventory is a failed check, never evidence of a working setup.
export function validateNativeReport(report, { cwds, skills, servers }) {
  const failures = [];
  for (const cwd of cwds) {
    const config = report.configs?.find(item => item.cwd === cwd);
    if (!config || config.approval !== "never" || config.permissions !== "lms") {
      failures.push(`${cwd}: project permissions were not loaded`);
    }
    if (config?.contextWindow !== 600000 || config?.autoCompactLimit !== 540000) {
      failures.push(`${cwd}: 600k context window with early auto-compact was not loaded`);
    }
    for (const name of servers) {
      if (!config?.mcp?.includes(name)) failures.push(`${cwd}: MCP configuration missing or disabled: ${name}`);
    }
    const inventory = report.skills?.find(item => item.cwd === cwd);
    if (!inventory || !Array.isArray(inventory.errors) || inventory.errors.length) failures.push(`${cwd}: skill inventory missing or invalid`);
    for (const name of skills) {
      if (!inventory?.skills?.some(skill => skill.name === name && skill.enabled === true)) failures.push(`${cwd}: skill missing or disabled: ${name}`);
    }
    const hooks = report.hooks?.data?.find(item => item.cwd === cwd);
    if (!hooks || !Array.isArray(hooks.errors) || hooks.errors.length) failures.push(`${cwd}: hook inventory missing or invalid`);
    for (const event of ["sessionStart", "preToolUse", "stop"]) {
      const matches = hooks?.hooks?.filter(hook => hook.eventName === event) ?? [];
      if (matches.length !== 1 || matches[0].enabled !== true || matches[0].trustStatus !== "trusted") {
        failures.push(`${cwd}: ${event} hook must be enabled, trusted and loaded once`);
      }
    }
    const mcp = report.mcp?.find(item => item.cwd === cwd);
    for (const name of servers) {
      if (!mcp?.servers?.some(server => server.name === name && server.tools > 0)) failures.push(`${cwd}: MCP handshake/tools missing: ${name}`);
    }
  }
  return failures;
}
