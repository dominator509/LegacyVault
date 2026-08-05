import net from "node:net";

const target = new URL(process.env.REDIS_URL ?? "");
if (target.protocol !== "redis:" && target.protocol !== "rediss:") {
  throw new Error("redis probe: unsupported URL protocol");
}

const socket = net.createConnection({
  host: target.hostname,
  port: Number(target.port || 6379),
  timeout: 20_000,
});

const encode = (...parts) =>
  `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;

let response = "";
socket.setEncoding("utf8");
socket.on("connect", () => {
  if (target.password) {
    socket.write(
      encode(
        "AUTH",
        decodeURIComponent(target.username || "default"),
        decodeURIComponent(target.password),
      ),
    );
  }
  socket.write(encode("PING"));
});
socket.on("data", (chunk) => {
  response += chunk;
  if (response.includes("+PONG\r\n")) socket.end();
});
socket.on("timeout", () => socket.destroy(new Error("redis probe: timeout")));
socket.on("error", (error) => {
  process.stderr.write(`redis probe: ${error.name}\n`);
  process.exitCode = 1;
});
socket.on("close", () => {
  if (!response.includes("+PONG\r\n")) process.exitCode = 1;
});
