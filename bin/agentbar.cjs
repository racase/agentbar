#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const distIndex = path.join(root, "dist", "index.html");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const cliArgs = process.argv.slice(2);

if (cliArgs.includes("--help") || cliArgs.includes("-h")) {
  console.log(`AgentBar

Uso:
  npx .                 Inicia la app en la bandeja del sistema
  npx . --foreground    Inicia la app en primer plano y muestra logs
  npx . --show          Inicia la app y abre el resumen
  npx . --version       Muestra la version
`);
  process.exit(0);
}

if (cliArgs.includes("--version") || cliArgs.includes("-v")) {
  const pkg = require(path.join(root, "package.json"));
  console.log(pkg.version);
  process.exit(0);
}

if (!fs.existsSync(distIndex)) {
  const build = spawnSync(npmCommand, ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (build.status !== 0) {
    process.exit(build.status || 1);
  }
}

let electronBinary;
try {
  electronBinary = require("electron");
} catch {
  console.error("Electron no esta instalado. Ejecuta `npm install` y vuelve a probar `npx .`.");
  process.exit(1);
}

const args = cliArgs;
const foreground = args.includes("--foreground");
const electronArgs = [root, ...args.filter((arg) => arg !== "--foreground")];

if (foreground) {
  const result = spawnSync(electronBinary, electronArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    windowsHide: false,
  });

  process.exit(result.status || 0);
}

const child = spawn(electronBinary, electronArgs, {
  cwd: root,
  detached: true,
  stdio: "ignore",
  shell: false,
  windowsHide: false,
});

child.unref();
console.log("AgentBar iniciado en la bandeja del sistema.");
