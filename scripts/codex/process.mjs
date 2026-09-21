// Applies only to child processes started by this harness.
export function stopChild(child, signal = "SIGTERM", timeoutMs = 2000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      child.off("exit", finish);
      child.off("error", finish);
      resolve();
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeoutMs);
    child.once("exit", finish);
    child.once("error", finish);
    if (!child.kill(signal)) finish();
  });
}
