import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    // externalizeDepsPlugin only externalizes `dependencies`; we keep `electron`
    // and native modules explicitly external as a safeguard.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron', 'better-sqlite3']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron'],
        // Sandboxed preloads must be CommonJS; emit a .cjs file (valid CJS even
        // though the package is "type": "module").
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    build: {
      rollupOptions: {
        // Multi-window app: each window type is a separate HTML entry point.
        input: {
          note: resolve('src/renderer/note.html'),
          explorer: resolve('src/renderer/explorer.html'),
          options: resolve('src/renderer/options.html'),
          settings: resolve('src/renderer/settings.html')
        }
      }
    }
  }
})
