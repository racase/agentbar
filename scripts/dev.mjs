import { spawn } from "node:child_process";
import net from "node:net";

const vite = spawn("npx", ["vite", "--host", "127.0.0.1"], {
  stdio: "inherit",
  shell: true,
});

await waitForPort(5173);

const electron = spawn("npx", ["electron", "."], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: "http://127.0.0.1:5173",
  },
});

electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  electron.kill();
  vite.kill();
  process.exit(0);
});

function waitForPort(port) {
  return new Promise((resolve) => {
    const check = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        setTimeout(check, 120);
      });
    };
    check();
  });
}
