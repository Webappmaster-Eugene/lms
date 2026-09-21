// Missing inventory is a failed check, never evidence of a working setup.
export function validateNativeReport(report, { cwds, skills, servers }) {
  const failures = [];
  for (const cwd of cwds) {
    const config = report.configs?.find(item => item.cwd === cwd);
    if (!config || config.approval !== "never" || config.permissions !== "lms") {
      failures.push(`${cwd}: project permissions were not loaded`);
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
    for (const event of ["sessionStart", "stop"]) {
      const matches = hooks?.hooks?.filter(hook => hook.eventName === event) ?? [];
      if (matches.length !== 1 || matches[0].enabled !== true || matches[0].trustStatus !== "trusted") {
        failures.push(`${cwd}: ${event} hook must be enabled, trusted and loaded once`);
      }
    }
  }
  for (const name of servers) {
    if (!report.mcp?.some(server => server.name === name && server.tools > 0)) failures.push(`MCP handshake/tools missing: ${name}`);
  }
  return failures;
}
