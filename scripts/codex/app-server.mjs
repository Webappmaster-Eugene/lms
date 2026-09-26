// JSON-RPC client for `codex app-server`; no model turn is started.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { stopChild } from "./process.mjs";

export async function openAppServer(cwd, clientName) {
  const child = spawn("codex", ["app-server", "--stdio", "--strict-config"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let sequence = 0;
  const failAll = error => { for (const entry of pending.values()) entry.reject(error); };
  child.stderr.on("data", () => {});
  child.stdin.on("error", failAll);
  child.on("error", failAll);
  child.on("exit", () => failAll(new Error("Codex app-server exited")));
  createInterface({ input: child.stdout }).on("line", line => {
    let message;
    try { message = JSON.parse(line); } catch { return; } // Non-protocol output.
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
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
  const close = () => stopChild(child);
  try {
    await rpc("initialize", { clientInfo: { name: clientName, version: "1.0.0" }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
  } catch (error) { await close(); throw error; }
  return { rpc, close };
}
