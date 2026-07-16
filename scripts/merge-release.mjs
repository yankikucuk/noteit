/**
 * @file Assembles GitHub Release assets from the per-OS CI build artifacts.
 *
 * Every platform's installers are downloaded into separate subdirectories.
 * This script flattens them into one staging directory and merges the two
 * Windows `latest.yml` files — one per architecture, produced on separate
 * runners (x64 on windows-latest, arm64 on windows-11-arm) — into a single
 * `latest.yml` listing every Windows installer. macOS (`latest-mac.yml`) and
 * Linux (`latest-linux.yml`) metadata are unique per platform and are copied
 * through unchanged.
 *
 * Correctness guards (the auto-update contract):
 *  - Two artifacts with the same file name but different content abort the
 *    build. A silent first-copy-wins here once shipped a `latest.yml` whose
 *    checksums belonged to installers that were never uploaded, breaking
 *    Windows auto-update with a sha512 mismatch.
 *  - Merged metadata entries must agree per URL; the x64 installer is listed
 *    first and becomes the top-level `path`/`sha512`, so updaters without
 *    arch-aware file selection fall back to the x64 build.
 *
 * Usage: node scripts/merge-release.mjs <artifactsDir> <stagingDir>
 */
import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { pathToFileURL } from 'url'
import { createHash } from 'crypto'
import yaml from 'js-yaml'

/** Windows update-metadata filename (one per arch runner, must be merged). */
const WIN_METADATA = 'latest.yml'

/**
 * Recursively lists every file path under a directory.
 * @param {string} dir - Directory to walk.
 * @returns {string[]} File paths.
 */
export function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/**
 * Computes a file's SHA-512 digest (base64), used to detect name collisions
 * with differing content.
 * @param {string} filePath - File to hash.
 * @returns {string} Base64 digest.
 */
function fileDigest(filePath) {
  return createHash('sha512').update(readFileSync(filePath)).digest('base64')
}

/**
 * Copies every artifact into the flat staging directory, excluding the Windows
 * metadata files (returned for merging). Identical duplicates are copied once;
 * same-named files with different content abort the release.
 * @param {string} artifactsDir - Root of the downloaded per-OS artifacts.
 * @param {string} stagingDir - Flat output directory (created if missing).
 * @returns {string[]} Paths of the Windows metadata files found.
 */
export function stageAssets(artifactsDir, stagingDir) {
  mkdirSync(stagingDir, { recursive: true })
  const files = walk(artifactsDir)
  const winMetadata = files.filter((f) => basename(f) === WIN_METADATA)
  const seen = new Map()
  for (const f of files) {
    const name = basename(f)
    if (name === WIN_METADATA) continue
    const digest = fileDigest(f)
    const prev = seen.get(name)
    if (prev !== undefined) {
      if (prev !== digest) {
        throw new Error(
          `Conflicting release assets named "${name}": two runners produced different ` +
            `content for the same file. Publishing one with the other's update metadata ` +
            `breaks auto-update — fix the build matrix so each artifact is built exactly once.`
        )
      }
      continue
    }
    seen.set(name, digest)
    copyFileSync(f, join(stagingDir, name))
  }
  return winMetadata
}

/**
 * Merges per-arch Windows update metadata documents into one. Entries must
 * agree per URL and per version; the x64 installer is ordered first and
 * provides the legacy top-level `path`/`sha512` fields.
 * @param {object[]} docs - Parsed `latest.yml` documents (one per arch).
 * @returns {object} The merged document.
 */
export function mergeWindowsMetadata(docs) {
  if (!docs.length) throw new Error('No Windows metadata documents to merge')
  const versions = new Set(docs.map((d) => d.version))
  if (versions.size > 1) {
    throw new Error(`Windows metadata version mismatch: ${[...versions].join(', ')}`)
  }
  const byUrl = new Map()
  for (const doc of docs) {
    for (const entry of doc.files || []) {
      const prev = byUrl.get(entry.url)
      if (prev && prev.sha512 !== entry.sha512) {
        throw new Error(
          `Conflicting update metadata for "${entry.url}": two documents carry different ` +
            `checksums for the same installer name.`
        )
      }
      byUrl.set(entry.url, entry)
    }
  }
  // x64 first: updaters without arch-aware selection fall back to files[0].
  const files = [...byUrl.values()].sort(
    (a, b) => Number(b.url.includes('x64')) - Number(a.url.includes('x64'))
  )
  if (!files.length) throw new Error('Merged Windows metadata contains no installer entries')
  const primary = files.find((f) => f.url.includes('x64')) || files[0]
  return {
    version: docs[0].version,
    files,
    path: primary.url,
    sha512: primary.sha512,
    releaseDate: docs[0].releaseDate
  }
}

/**
 * CLI entry: stages all artifacts and writes the merged Windows metadata.
 * @param {string} artifactsDir - Root of the downloaded per-OS artifacts.
 * @param {string} stagingDir - Flat output directory.
 */
export function main(artifactsDir, stagingDir) {
  const winMetadata = stageAssets(artifactsDir, stagingDir)
  if (winMetadata.length) {
    const docs = winMetadata.map((f) => yaml.load(readFileSync(f, 'utf8')))
    const merged = mergeWindowsMetadata(docs)
    writeFileSync(join(stagingDir, WIN_METADATA), yaml.dump(merged, { lineWidth: -1 }))
    console.log(
      `Merged ${winMetadata.length} Windows ${WIN_METADATA} → ${merged.files.length} installer(s)`
    )
  }
  console.log(`Staged ${readdirSync(stagingDir).length} files in "${stagingDir}"`)
}

// Run only when invoked directly (keeps the module importable from tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [artifactsDir, stagingDir] = process.argv.slice(2)
  if (!artifactsDir || !stagingDir) {
    console.error('Usage: node scripts/merge-release.mjs <artifactsDir> <stagingDir>')
    process.exit(1)
  }
  main(artifactsDir, stagingDir)
}
