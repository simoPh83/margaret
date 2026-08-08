// Cross-platform equivalent of the bash tauri:build script
const { execSync } = require('child_process')
const { readFileSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const key = readFileSync(join(root, 'src-tauri', 'private.tauri.key'), 'utf8').trim()
const pass = readFileSync(join(root, 'src-tauri', 'private.tauri.key.pass'), 'utf8').trim()

execSync('npx tauri build', {
  stdio: 'inherit',
  cwd: root,
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: key,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: pass,
  },
})
