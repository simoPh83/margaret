# macOS Signing & Distribution Notes

Status: **not yet implemented** — the app is currently unsigned/unnotarized.
This doc collects everything we know so far, to pick up when ready.

## Which build for which Mac

| Mac | Build artifact | `latest.json` platform key |
|-----|----------------|----------------------------|
| Apple Silicon (M1/M2/M3/M4) | `margaret_<ver>_aarch64.dmg` / `margaret_aarch64.app.tar.gz` | `darwin-aarch64` |
| Intel | `margaret_<ver>_x64.dmg` / `margaret_x64.app.tar.gz` | `darwin-x86_64` |

This machine (iMac M1) = **aarch64**. The x64 build only runs via Rosetta 2 —
slower, and not the correct target. The in-app updater picks the right one
automatically via the platform key.

## The two Gatekeeper dialogs (and what they actually mean)

Both appear because the app is unsigned/unnotarized and downloaded from the
internet (browser sets the quarantine attribute). Locally-built apps don't get
the quarantine flag, which is why local builds "just work".

### x64 build → "Apple could not verify margaret is free of malware..."

- Meaning: bundle is intact, macOS just doesn't trust it (Gatekeeper warning).
- Bypass: right-click → Open, or System Settings → Privacy & Security → Open Anyway,
  or `xattr -dr com.apple.quarantine /Applications/margaret.app`
- x86_64 binaries are tolerated unsigned, hence the milder dialog.

### aarch64 build → "margaret is damaged and can't be opened. You should move it to the Bin."

- Meaning: the **code signature is missing/invalid**. On Apple Silicon every
  binary **must** have at least an ad-hoc signature — it's a hard platform
  requirement, not just Gatekeeper. So the same unsigned app gives a warning on
  x64 but "damaged" on arm64.
- This does NOT mean the x64 build is the right one for an M1 — it means the
  aarch64 CI build's signature is broken.
- Verify a downloaded build:

  ```bash
  codesign -dv --verbose=4 /Applications/margaret.app 2>&1 | head -5
  spctl -a -vv /Applications/margaret.app
  ```

  - "code object is not signed at all" → bundler didn't ad-hoc sign it
  - "invalid signature" → signing broke mid-build

- Workaround (usually makes an unsigned arm64 app launch):

  ```bash
  xattr -cr /Applications/margaret.app
  ```

  (`-c` clears all attributes including quarantine.)

## Things to investigate in CI

- Check the aarch64 job log in [.github/workflows/release.yml](../.github/workflows/release.yml)
  for `codesign` errors/warnings during bundling. Suspect: the ad-hoc signing
  step silently fails for the `aarch64-apple-darwin` target.
- The same unsigned-bundle problem likely explains the **auto-updater failing on
  macOS**: the updater installs the new `.app`, and an unsigned arm64 bundle
  refuses to launch after relaunch (the Sentry capture added in
  [src/lib/updater.ts](../src/lib/updater.ts) should confirm this — look for
  events tagged `updater-install`).

## The proper fix: Developer ID + notarization ($99/year)

The only way to make both dialogs disappear for all users:

1. Join the Apple Developer Program.
2. Create a **Developer ID Application** certificate.
3. Add GitHub secrets and env vars to the release workflow:
   - `APPLE_CERTIFICATE` (base64-encoded .p12) / `APPLE_CERTIFICATE_PASSWORD`
   - `APPLE_SIGNING_IDENTITY`
   - `APPLE_ID` + `APPLE_PASSWORD` (app-specific password) + `APPLE_TEAM_ID`
     (or API key variant: `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH`)
4. Tauri's bundler then signs **and notarizes** automatically during `tauri build`.

**Important:** once releases are properly signed, sign ALL future releases with
the same identity, and keep the updater pubkey in
[src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) consistent. Mixed
signed/unsigned releases can break the in-app update path on macOS.

## Pragmatic stopgap (internal users only)

Ship a note with the DMG telling users to run:

```bash
xattr -cr /Applications/margaret.app   # or wherever the app was copied
```

Works, but looks sketchy to end users — fine for internal testing only.
