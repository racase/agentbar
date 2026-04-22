# AgentBar

Windows tray app built with React and Electron. It shows a compact usage summary for AI agents directly from the system tray.

## Screenshots

| Dark mode | Light mode |
| --- | --- |
| ![AgentBar in dark mode](docs/screenshots/agentbar-dark.png) | ![AgentBar in light mode](docs/screenshots/agentbar-light.png) |

## Requirements

- Node.js 20 or later
- Windows 11 for the system tray experience

## Development

```powershell
npm install
npm run dev
```

The app opens a tray icon. Left click shows the summary; right click opens the action menu.

## Run After Cloning

```powershell
git clone <repo-url>
cd agentbar
npx .
```

`npx .` installs what it needs in the npm cache, builds the UI if `dist/` is missing, and starts the app in the system tray. To run it in the foreground and see logs:

```powershell
npx . --foreground
```

## Package

```powershell
npm run build
npm run package
```

Installers are written to `release/`.
