/**
 * @file Assembles GitHub Release assets from the per-OS CI build artifacts.
 *
 * Every platform's installers are downloaded into separate subdirectories. This
 * script flattens them into one staging directory and, crucially, merges the
 * multiple Windows `latest.yml` files — one per architecture, produced on
 * separate runners (x64 on windows-latest, arm64 on windows-11-arm) — into a
 * single `latest.yml` that lists every Windows installer. Without the merge the
 * two files would collide on upload and electron-updater would only serve one
 * architecture. macOS (`latest-mac.yml`) and Linux (`latest-linux.yml`) metadata
 * are unique per platform, so they are copied through unchanged.
 *
 * Usage: node scripts/merge-release.mjs <artifactsDir> <stagingDir>
 */
import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import yaml from 'js-yaml'

const [artifactsDir, stagingDir] = process.argv.slice(2)
if (!artifactsDir || !stagingDir) {
  console.error('Usage: node scripts/merge-release.mjs <artifactsDir> <stagingDir>')
  process.exit(1)
}

/** Windows update-metadata filename (one per arch, must be merged). */
const WIN_METADATA = 'latest.yml'

/**
 * Recursively lists every file path under a directory.
 * @param {string} dir - Directory to walk.
 * @returns {string[]} Absolute-ish file paths.
 */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

mkdirSync(stagingDir, { recursive: true })

const files = walk(artifactsDir)
const winMetadata = files.filter((f) => basename(f) === WIN_METADATA)

// Copy every asset except the Windows metadata (handled by the merge below).
// Installer/blockmap names already carry the arch, so basenames never collide.
const copied = new Set()
for (const f of files) {
  const name = basename(f)
  if (name === WIN_METADATA || copied.has(name)) continue
  copyFileSync(f, join(stagingDir, name))
  copied.add(name)
}

// Merge the per-arch Windows metadata into a single latest.yml whose `files`
// array lists every Windows installer. Keep the x64 document's top-level fields
// (path/sha512/size) as the default, matching a single-machine multi-arch build.
if (winMetadata.length) {
  const docs = winMetadata.map((f) => yaml.load(readFileSync(f, 'utf8')))
  const base = docs.find((d) => String(d.path || '').includes('x64')) || docs[0]
  const byUrl = new Map()
  for (const doc of docs) {
    for (const entry of doc.files || []) byUrl.set(entry.url, entry)
  }
  const merged = { ...base, files: [...byUrl.values()] }
  writeFileSync(join(stagingDir, WIN_METADATA), yaml.dump(merged, { lineWidth: -1 }))
  console.log(
    `Merged ${winMetadata.length} Windows ${WIN_METADATA} → ${merged.files.length} installer(s)`
  )
}

console.log(`Staged ${readdirSync(stagingDir).length} files in "${stagingDir}"`)
