#!/usr/bin/env node
// Build the plugin's bundled ThoughtDAG SPA with a subpath base so the host
// half can serve it under /thoughtdag/. Usage:
//   node scripts/build.mjs [thoughtdag-repo] [outDir]   (from dsh/: node scripts/build.mjs ..)
//   npm run dsh:build                                  (from the repo root)
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, cpSync, existsSync, realpathSync } from 'node:fs'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repo = resolve(process.argv[2] ?? process.env.THOUGHTDAG_REPO ?? resolve(__dirname, '../..'))
const outDir = resolve(process.argv[3] ?? resolve(__dirname, '../dist-app'))
const tmp = resolve(__dirname, '../.dist-tmp')
const buildRoot = realpathSync(resolve(__dirname, '..'))
for (const target of [tmp, outDir]) {
  let existing = target
  while (!existsSync(existing)) existing = dirname(existing)
  const actual = realpathSync(existing)
  if (!target.startsWith(buildRoot + sep) || (actual !== buildRoot && !actual.startsWith(buildRoot + sep)))
    throw new Error('Build output must stay inside the plugin directory: ' + target)
}

if (!existsSync(resolve(repo, 'package.json'))) {
  console.error('thoughtdag repo not found at', repo)
  process.exit(1)
}
console.log('building thoughtdag (base /thoughtdag/) from', repo)
rmSync(tmp, { recursive: true, force: true })
// VITE_API_BASE points the SPA's own proxy calls (/api/models, /api/stream…) at
// this host, which answers them on the harness's providers.
// VITE_DSH_BRIDGE tells the SPA where the plugin's session bridge answers, so
// it installs the harness-backed window.desktopSessions at boot
// The type gate the root `npm run build` has, then vite itself. tsc and vite
// ship pure-JS entries no installer ever touches, so both run as node scripts
// through this process's own node binary: execFileSync cannot spawn `npm` (a
// .cmd needing a shell on Windows) nor the extensionless .bin shims, while a
// JS entry takes argv verbatim — no shell, no quoting, one code path.
execFileSync(process.execPath, [resolve(repo, 'node_modules/typescript/bin/tsc'), '-b'], { cwd: repo, stdio: 'inherit' })
execFileSync(process.execPath, [resolve(repo, 'node_modules/vite/bin/vite.js'), 'build', '--base=/thoughtdag/', '--outDir=' + tmp], { cwd: repo, stdio: 'inherit', env: { ...process.env, VITE_DSH_BRIDGE: '/thoughtdag/api', VITE_API_BASE: '/thoughtdag' } })
// keep only what the embedded SPA needs; landing-page covers are not served
rmSync(resolve(tmp, 'covers'), { recursive: true, force: true })
// the tutorial's gifs stay: a first-time visitor inside the harness sees the same walkthrough
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
cpSync(tmp, outDir, { recursive: true })
rmSync(tmp, { recursive: true, force: true })
console.log('plugin SPA written to', outDir)
