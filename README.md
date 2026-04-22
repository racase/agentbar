# AgentBar

App de bandeja para Windows hecha con React + Electron. Muestra un resumen compacto estilo CodexBar con datos locales de Codex y Claude.

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

## Datos locales

- Codex: `%USERPROFILE%\.codex\sessions`
- Claude: `%USERPROFILE%\.claude\usage-data\session-meta`
- Sesion web de Claude: se guarda en el directorio de datos de la app de Electron, no en el repo.

Codex usa `token_count.rate_limits` para pintar `Sesion actual`, `5 h` y `Semanal`.

## Seguridad

No subas datos de usuario ni sesiones al repositorio. `.gitignore` excluye `node_modules/`, `.tools/`, `dist/`, `release/`, `.electron-user-data/`, cookies y ficheros `.env`.
