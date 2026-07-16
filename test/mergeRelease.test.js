import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { stageAssets, mergeWindowsMetadata } from '../scripts/merge-release.mjs'

/** Creates <root>/<dir> with the given files and returns its path. */
function makeArtifactDir(root, dir, files) {
  const p = join(root, dir)
  mkdirSync(p, { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(p, name), content)
  return p
}

describe('merge-release staging', () => {
  let root, staging
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'noteit-merge-'))
    staging = join(root, 'staging')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('flattens per-runner artifacts and returns the Windows metadata paths', () => {
    makeArtifactDir(root + '/a', 'win-x64', {
      'App-x64.exe': 'x64-bytes',
      'latest.yml': 'version: 1.0.0'
    })
    makeArtifactDir(root + '/a', 'win-arm', {
      'App-arm64.exe': 'arm-bytes',
      'latest.yml': 'version: 1.0.0'
    })
    const meta = stageAssets(root + '/a', staging)
    expect(meta).toHaveLength(2)
    expect(readdirSync(staging).sort()).toEqual(['App-arm64.exe', 'App-x64.exe'])
    expect(readFileSync(join(staging, 'App-x64.exe'), 'utf8')).toBe('x64-bytes')
  })

  it('tolerates identical duplicates but aborts on same-named different content', () => {
    makeArtifactDir(root + '/b', 'one', { 'App.exe': 'same' })
    makeArtifactDir(root + '/b', 'two', { 'App.exe': 'same' })
    expect(() => stageAssets(root + '/b', staging)).not.toThrow()

    makeArtifactDir(root + '/c', 'one', { 'App.exe': 'bytes-A' })
    makeArtifactDir(root + '/c', 'two', { 'App.exe': 'bytes-B' })
    expect(() => stageAssets(root + '/c', join(root, 's2'))).toThrow(/Conflicting release assets/)
  })
})

describe('mergeWindowsMetadata', () => {
  const x64Doc = {
    version: '1.0.3',
    files: [{ url: 'App-1.0.3-x64.exe', sha512: 'SHA-X64', size: 100 }],
    path: 'App-1.0.3-x64.exe',
    sha512: 'SHA-X64',
    releaseDate: '2026-07-16T00:00:00.000Z'
  }
  const armDoc = {
    version: '1.0.3',
    files: [{ url: 'App-1.0.3-arm64.exe', sha512: 'SHA-ARM', size: 90 }],
    path: 'App-1.0.3-arm64.exe',
    sha512: 'SHA-ARM',
    releaseDate: '2026-07-16T00:01:00.000Z'
  }

  it('merges per-arch documents with x64 first and as the top-level path', () => {
    // arm doc first on purpose: order of inputs must not matter.
    const merged = mergeWindowsMetadata([armDoc, x64Doc])
    expect(merged.version).toBe('1.0.3')
    expect(merged.files.map((f) => f.url)).toEqual(['App-1.0.3-x64.exe', 'App-1.0.3-arm64.exe'])
    expect(merged.path).toBe('App-1.0.3-x64.exe')
    expect(merged.sha512).toBe('SHA-X64')
  })

  it('rejects conflicting checksums for the same installer name', () => {
    const conflicting = { ...x64Doc, files: [{ url: 'App-1.0.3-x64.exe', sha512: 'OTHER' }] }
    expect(() => mergeWindowsMetadata([x64Doc, conflicting])).toThrow(/Conflicting update metadata/)
  })

  it('rejects mixed versions and empty input', () => {
    const other = { ...armDoc, version: '1.0.4' }
    expect(() => mergeWindowsMetadata([x64Doc, other])).toThrow(/version mismatch/)
    expect(() => mergeWindowsMetadata([])).toThrow(/No Windows metadata/)
  })

  it('falls back to the first file when no x64 entry exists', () => {
    const merged = mergeWindowsMetadata([armDoc])
    expect(merged.path).toBe('App-1.0.3-arm64.exe')
    expect(merged.sha512).toBe('SHA-ARM')
  })
})
