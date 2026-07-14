import { defineConfig } from 'vitest/config'

/**
 * Vitest runs in a Node environment and covers the pure modules (no Electron or
 * native better-sqlite3 dependency, which is compiled for the Electron ABI).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js']
  }
})
