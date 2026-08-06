import { spawn } from "node:child_process";

const commands = [
  ["api", ["--filter", "@legacy/api", "start"]],
  ["web", ["--filter", "@legacy/web", "start"]],
  ["worker", ["--filter", "@legacy/worker", "start"]],
];
const children = new Map();
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill(signal);
  setTimeout(() => {
    for (const child of children.values()) child.kill("SIGKILL");
  }, 10_000).unref();
}

for (const [name, args] of commands) {
  const child = spawn("pnpm", args, {
    env: {
      ...process.env,
      ...(name === "web" ? { PORT: "3000" } : {}),
      ...(name === "api" ? { PORT: "3001" } : {}),
    },
    shell: false,
    stdio: "inherit",
  });
  children.set(name, child);
  child.once("error", (error) => {
    process.stderr.write(`${name} failed to start: ${error.name}\n`);
    process.exitCode = 1;
    stop("SIGTERM");
  });
  child.once("exit", (code, signal) => {
    children.delete(name);
    if (!stopping) {
      process.stderr.write(
        `${name} exited unexpectedly (${signal ?? String(code ?? 1)})\n`,
      );
      process.exitCode = code === 0 ? 1 : (code ?? 1);
      stop("SIGTERM");
    }
    if (children.size === 0) process.exit(process.exitCode ?? 0);
  });
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
