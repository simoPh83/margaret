# Developer Setup Guide (macOS & Windows)

Everything you need to get the project building and running on your machine.

## 1. Prerequisites

### Node.js — version 22 (required, not optional)

The project's dependencies (Supabase packages) require **Node ≥ 22**, and the repo pins the version so everyone uses the same one (`.nvmrc` in the repo root).

#### Node on macOS

Recommended: use a version manager.

```sh
# Option A: nvm
brew install nvm
mkdir ~/.nvm
# add to ~/.zshrc:
#   export NVM_DIR="$HOME/.nvm"
#   [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"

# Option B: fnm (faster)
brew install fnm
# add to ~/.zshrc:
#   eval "$(fnm env --use-on-cd)"
```

Then in the project folder:

```sh
nvm use          # reads .nvmrc → installs/selects Node 22
# or with fnm: it switches automatically when you cd into the folder
node --version   # should print v22.x.x (≥ 22.20.0)
```

#### Node on Windows

**nvm-windows does NOT read `.nvmrc`** — install and select the version explicitly:

```powershell
# Option A: nvm-windows (install from https://github.com/coreybutler/nvm-windows/releases)
nvm install 22
nvm use 22

# Option B: Volta (https://volta.sh) — automatically reads package.json engines
volta install node@22
```

```powershell
node --version   # should print v22.x.x (≥ 22.20.0)
```

> If you skip this and use Node 20 or an old 22.x, you'll get engine warnings or Sentry/native-module compile errors.

### Rust (for building the desktop app)

#### Rust on macOS

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# choose default installation, then:
source ~/.cargo/env
```

#### Rust on Windows

1. Download and run `rustup-init.exe` from <https://rustup.rs> (choose default installation), then restart your terminal.
2. Install **Visual Studio C++ Build Tools** from <https://visualstudio.microsoft.com/visual-cpp-build-tools/> — during install, select the **"Desktop development with C++"** workload. (Rust on Windows cannot link without this.)
3. **WebView2** — usually already present on Windows 10/11. If not, install the Evergreen runtime from <https://developer.microsoft.com/en-us/microsoft-edge/webview2/>

## 2. Get the project

```sh
git clone <repo-url> margaret
cd margaret
git pull           # make sure you have the latest main, including the fixed package-lock.json
```

## 3. Install dependencies

**Important:** use `npm ci`, not `npm install`. This installs exactly what's in the committed lock file and never modifies it.

```sh
npm ci
```

### ⚠️ Rule: never edit or regenerate `package-lock.json` by hand

- If you hit an install error, **do not** edit the lock file or run `npm install` and commit the result — that's what broke the CI builds. Ask first.
- Only add/upgrade packages with `npm install <package>` (which updates the lock file properly), and commit both `package.json` and `package-lock.json` together.
- Always be on Node 22 (step 1) when doing anything with npm — a different Node version produces a different lock file.

## 4. Environment variables

Create a `.env.local` file in the project root (not committed to git):

```env
NEXT_PUBLIC_SUPABASE_URL=<ask for this>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ask for this>
NEXT_PUBLIC_API_URL=<ask for this>
```

## 5. Run the app in the browser

```sh
npm run dev
# → http://localhost:3000
```

## 6. Build the desktop app (Tauri)

The build script needs the **signing key**, which is not in git. You need this file placed in `src-tauri/`:

```text
src-tauri/private.tauri.key       ← ask for this (keep it private, never commit it)
```

(`private.tauri.key.pass` is already in the repo.)

Then:

```sh
npm run tauri:build
```

The macOS `.dmg` installer lands in `src-tauri/target/release/bundle/dmg/`.
On Windows you get `.msi` / `.exe` installers in `src-tauri\target\release\bundle\msi\` and `...\nsis\`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm ci` fails with "lock file out of sync" | You're on an old commit — `git pull`. Don't edit the lock file. |
| Sentry / native module compile errors | Wrong Node version. Switch to Node 22 (`nvm use 22`), then `rm -rf node_modules && npm ci` (Windows: delete the `node_modules` folder, then `npm ci`) |
| `tauri:build` fails reading the key | `src-tauri/private.tauri.key` is missing — ask for it |
| `next: command not found` | Dependencies not installed — run `npm ci` |
| Windows: `link.exe not found` / linker errors | C++ Build Tools missing — install with the "Desktop development with C++" workload |
| Windows: app builds but shows blank window | WebView2 runtime missing — install the Evergreen runtime |
