# Margaret — Automated Builds & In-App Updates

## Progress

### Part 1 — One-time local setup
- [x] Step 1 — Add updater plugins to Cargo.toml
- [x] Step 2 — Register plugins in lib.rs
- [x] Step 3 — Declare capabilities
- [x] Step 4 — Generate Tauri signing key pair
- [x] Step 5 — Configure updater endpoint in tauri.conf.json
- [x] Step 6 — Add updater npm packages
- [x] Step 7 — Add in-app update UI
- [ ] Step 8 — Version bump strategy (reference only)

### Part 2 — GitHub repository configuration
- [x] Step 1 — Add GitHub Secrets
- [x] Step 2 — Enable GitHub Pages
- [x] Step 3 — Set workflow permissions

### Part 3 — Ship it
- [x] Create `.github/workflows/release.yml`
- [x] First tag push and smoke test
  > **Note:** Manual `workflow_dispatch` run confirmed all build jobs succeed.
  > Tag-triggered run not yet verified — GitHub Actions webhook incident on 2026-08-06
  > throttled tag push events to ~15%. Re-test by pushing a new tag once the incident resolves.

---

## Overview

When you push a git tag, GitHub Actions builds Margaret for **Windows** and **macOS** (both Intel
and Apple Silicon), attaches the installers to a GitHub Release, and publishes an update manifest to
GitHub Pages. Running copies of Margaret poll that manifest and prompt the user to update with a
single click.

No paid OS code-signing certificate is required to get started. The implications are noted in each
relevant section, and a dedicated section at the end describes exactly what changes when you add one
later.

---

## How it all fits together

```
developer                  GitHub                       users
──────────                 ──────                       ─────
git tag v1.2.0   ──push──► Actions workflow runs
                            ├── builds Windows .exe/.msi
                            ├── builds macOS .dmg (x64 + arm64)
                            ├── signs each artifact with Tauri key
                            ├── creates GitHub Release  ──────────► user downloads once (first install)
                            └── writes latest.json
                                    to GitHub Pages     ──polling──► running app checks version
                                                                      "Update available" button appears
                                                                      user clicks → silent download
                                                                      → auto-install → relaunch
```

### Two distinct types of "signing"

| | Tauri ed25519 key pair | OS code-signing certificate |
|---|---|---|
| **Purpose** | Verifies a downloaded update was built by you (tamper-proof) | Tells the OS the installer is from a known publisher |
| **Cost** | Free — generated locally | ~$400/yr (Windows EV cert) or free via Apple Developer account |
| **Required for updater?** | **Yes** | No |
| **Required for first install?** | No | No (but Windows SmartScreen warns, macOS Gatekeeper blocks) |
| **Set up when** | Before first release | Later, when ready |

---

## Part 1 — One-time local setup

### Step 1 — Add the updater plugin to Rust

In `src-tauri/Cargo.toml`, add:

```toml
[dependencies]
tauri-plugin-updater = "2"
tauri-plugin-process = "2"   # needed for the relaunch-after-update call
```

### Step 2 — Register the plugins in Rust

In `src-tauri/src/lib.rs`, add both plugins to the builder:

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // ...existing setup...
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Step 3 — Declare capabilities

In `src-tauri/capabilities/default.json`, add the two plugin permissions:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "updater:default",
    "process:allow-restart"
  ]
}
```

### Step 4 — Generate the Tauri signing key pair

Run this **once** on your local machine. It generates the private key (secret) and the public key
(safe to commit):

```bash
npx tauri signer generate -w ~/.tauri/margaret.key
```

The command prints something like:

```
Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1...
Private key saved to /Users/you/.tauri/margaret.key
Password: (the password you entered, or blank)
```

Keep the **private key file and its password** secret. You will add them as GitHub Secrets in
Part 2. The **public key string** goes into `tauri.conf.json` in the next step.

### Step 5 — Configure the updater endpoint in tauri.conf.json

Add a `plugins` block to `src-tauri/tauri.conf.json`. Replace the placeholders:

```json
{
  "productName": "margaret",
  "version": "0.1.0",
  ...
  "plugins": {
    "updater": {
      "pubkey": "PASTE_YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://YOUR_GITHUB_USERNAME.github.io/margaret/latest.json"
      ]
    }
  }
}
```

> **Note on the manifest URL:** GitHub Pages was chosen here as the simplest zero-cost static host
> that lives alongside the code. Alternatives include Supabase Storage (which is already in the
> stack) or any CDN. The URL just needs to serve a public JSON file.

### Step 6 — Add the updater npm package

```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

### Step 7 — Add the in-app update UI

Create `src/lib/updater.ts`:

```typescript
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from './isTauri';

export interface UpdateStatus {
  available: boolean;
  version?: string;
  install: () => Promise<void>;
}

export async function checkForUpdate(): Promise<UpdateStatus | null> {
  if (!isTauri()) return null;          // no-op in browser / dev server

  const update = await check();
  if (!update) return { available: false, install: async () => {} };

  return {
    available: true,
    version: update.version,
    install: async () => {
      await update.downloadAndInstall();
      await relaunch();
    },
  };
}
```

Then, wherever you want the update prompt (e.g. in your root layout or a settings panel):

```typescript
import { useEffect, useState } from 'react';
import { checkForUpdate, UpdateStatus } from '@/lib/updater';

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    checkForUpdate().then(setStatus);
  }, []);

  if (!status?.available) return null;

  return (
    <div>
      Version {status.version} is available.
      <button onClick={status.install}>Update now</button>
    </div>
  );
}
```

Style as needed with MUI. The `install()` call downloads in the background and restarts the app
automatically on completion — no further user interaction required.

### Step 8 — Version bump strategy

The version in `src-tauri/tauri.conf.json` drives everything (the installer filenames, the manifest
comparison). The `Cargo.toml` version should always match. Before tagging a release:

```bash
# 1. edit src-tauri/tauri.conf.json  → "version": "1.2.0"
# 2. edit src-tauri/Cargo.toml       → version = "1.2.0"
# 3. commit: git commit -am "chore: bump to v1.2.0"
# 4. tag:    git tag v1.2.0
# 5. push:   git push origin main --tags
```

The tag push is what fires the release workflow. A plain `git push` (without a matching `v*` tag)
does nothing to the release pipeline.

---

## Part 2 — GitHub repository configuration

### Step 1 — Add secrets

In your GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Full contents of `~/.tauri/margaret.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you entered when generating the key (leave blank if none) |

### Step 2 — Enable GitHub Pages

In **Settings → Pages**:

- Source: **Deploy from a branch**
- Branch: `gh-pages` / `/ (root)`

> GitHub creates the `gh-pages` branch automatically on first workflow run. If the Pages setting
> shows no branch yet, save it after the first successful release; Pages will then activate.

### Step 3 — Set workflow permissions

In **Settings → Actions → General → Workflow permissions**:

- Select **Read and write permissions**
- Check **Allow GitHub Actions to create and approve pull requests** (optional, not needed here)

---

## Part 3 — GitHub Actions workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'   # fires on v1.0.0, v2.3.1, etc. — not on plain pushes

permissions:
  contents: write

jobs:
  # ── Build on each platform ──────────────────────────────────────────────────
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - runner: windows-latest
            args: --target x86_64-pc-windows-msvc
            rust-target: x86_64-pc-windows-msvc

          - runner: macos-latest
            args: --target x86_64-apple-darwin
            rust-target: x86_64-apple-darwin

          - runner: macos-latest
            args: --target aarch64-apple-darwin
            rust-target: aarch64-apple-darwin

    runs-on: ${{ matrix.runner }}

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.rust-target }}

      - name: Rust build cache
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target

      - name: Install frontend dependencies
        run: npm ci

      # tauri-action builds the app, signs artifacts, creates/updates the
      # draft GitHub Release, and uploads all platform installers + .sig files.
      - name: Build and upload to release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: Margaret ${{ github.ref_name }}
          releaseBody: >
            Install the correct file for your platform below.
            Existing installs will be prompted to update automatically.
          releaseDraft: true    # stays draft until all platforms finish
          prerelease: false
          args: ${{ matrix.args }}

  # ── After all builds: generate update manifest and publish ──────────────────
  publish:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Download .sig files from the release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          mkdir sigs
          gh release download "${{ github.ref_name }}" \
            --pattern "*.sig" \
            --dir sigs

      - name: Generate latest.json
        env:
          TAG: ${{ github.ref_name }}
          REPO: ${{ github.repository }}
        run: |
          python3 - <<'EOF'
          import json, os
          from datetime import datetime, timezone
          from pathlib import Path

          tag    = os.environ['TAG']
          repo   = os.environ['REPO']
          version = tag.lstrip('v')
          base   = f"https://github.com/{repo}/releases/download/{tag}"
          date   = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

          platforms = {}
          for sig_file in sorted(Path('sigs').glob('*.sig')):
              stem = sig_file.stem          # filename without .sig extension
              sig  = sig_file.read_text().strip()
              if 'x64-setup.nsis' in stem:
                  platforms['windows-x86_64'] = {'signature': sig, 'url': f"{base}/{stem}"}
              elif 'aarch64.app.tar' in stem:
                  platforms['darwin-aarch64'] = {'signature': sig, 'url': f"{base}/{stem}"}
              elif 'x64.app.tar' in stem:
                  platforms['darwin-x86_64']  = {'signature': sig, 'url': f"{base}/{stem}"}

          manifest = {
              'version':  version,
              'notes':    f'Release {tag} — https://github.com/{repo}/releases/tag/{tag}',
              'pub_date': date,
              'platforms': platforms,
          }
          Path('update-manifest').mkdir(exist_ok=True)
          Path('update-manifest/latest.json').write_text(json.dumps(manifest, indent=2))
          print(json.dumps(manifest, indent=2))
          EOF

      - name: Deploy latest.json to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./update-manifest
          keep_files: false    # only latest.json lives on gh-pages

      - name: Publish release (undraft)
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release edit "${{ github.ref_name }}" --draft=false
```

---

## Part 4 — Day-to-day release process

```bash
# 1. Finish your changes and commit everything to main
git add .
git commit -m "feat: add export to CSV"

# 2. Bump both version files to the new version
#    src-tauri/tauri.conf.json  → "version": "1.1.0"
#    src-tauri/Cargo.toml       → version = "1.1.0"
git commit -am "chore: bump to v1.1.0"

# 3. Tag and push — this fires the release workflow
git tag v1.1.0
git push origin main --tags
```

Watch the workflow in the **Actions** tab. When it goes green:
- A GitHub Release named "Margaret v1.1.0" is live with installers attached.
- `https://YOUR_USERNAME.github.io/margaret/latest.json` is updated.
- Any running copy of Margaret will see the new version on its next check.

---

## Part 5 — What users experience

**First install:** user downloads the installer from the GitHub Releases page (or wherever you
distribute the link). On Windows without a code-signing cert, SmartScreen will show a "Windows
protected your PC" warning — the user clicks *More info → Run anyway*. This is a one-time
friction.

**Subsequent updates:** the running app checks the manifest, shows the `UpdateBanner`, user clicks
*Update now*, the new installer silently downloads and applies, and the app relaunches at the new
version. SmartScreen does **not** appear again for updates — the update mechanism bypasses the
normal installer flow.

---

## Part 6 — Adding OS-level code signing later

When you are ready to eliminate the SmartScreen warning (Windows) or Gatekeeper block (macOS),
these are the changes:

### Windows (Authenticode)

1. Purchase an EV (Extended Validation) code-signing certificate from DigiCert, Sectigo, etc.
2. Store the `.pfx` file and its password as GitHub Secrets:
   `WINDOWS_CERTIFICATE` (base64-encoded) and `WINDOWS_CERTIFICATE_PASSWORD`.
3. In the workflow, add a step before `tauri-action` to import the certificate into the Windows
   certificate store using `certutil`.
4. Set the `TAURI_WINDOWS_SIGN` env vars as documented in the Tauri signing guide.

No changes to the Tauri updater configuration are needed — the ed25519 key pair used for update
integrity is separate from Authenticode.

### macOS (notarization)

1. Enrol in the Apple Developer Program (~$99/yr).
2. Create a Developer ID Application certificate in Xcode / developer.apple.com.
3. Add to GitHub Secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
   `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
4. Pass these to `tauri-action` via the `env` block — `tauri-action` handles the
   `codesign` and `notarytool` calls automatically.

Again, no changes to the Tauri updater configuration — only the build environment changes.
