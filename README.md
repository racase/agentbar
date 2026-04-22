# AgentBar

App de bandeja para Windows hecha con React + Electron. Muestra un resumen compacto del uso de agentes de IA desde la barra del sistema.

## Capturas

| Modo oscuro | Modo claro |
| --- | --- |
| ![AgentBar en modo oscuro](docs/screenshots/agentbar-dark.png) | ![AgentBar en modo claro](docs/screenshots/agentbar-light.png) |

## Requisitos

- Node.js 20 o superior
- Windows 11 para la experiencia de bandeja del sistema

## Desarrollo

```powershell
npm install
npm run dev
```

La app abre un icono en la bandeja. Clic izquierdo muestra el resumen; clic derecho muestra acciones.

## Ejecutar tras clonar

```powershell
git clone <repo-url>
cd agentbar
npx .
```

`npx .` instala lo necesario en la cache de npm, compila la interfaz si falta `dist/` y lanza la app en la bandeja del sistema. Para ejecutarla en primer plano y ver logs:

```powershell
npx . --foreground
```

## Empaquetar

```powershell
npm run build
npm run package
```

Los instaladores quedan en `release/`.
