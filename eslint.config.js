import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

/**
 * Flat ESLint config. Main runs in Node; the preload bridge runs in a
 * Node-with-DOM context; the renderer runs in the browser. Vue SFCs use the
 * plugin's essential rules. No rule is disabled: unused args are opted out only
 * via the conventional `_` prefix.
 */
export default [
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'resources/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }]
    }
  },
  {
    files: ['src/main/**', 'scripts/**', '*.config.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    // The preload bridge has access to both Node (process, ipcRenderer) and the
    // DOM (window, when contextIsolation is disabled), so it needs both globals.
    files: ['src/preload/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['src/renderer/**'],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    // Shared, dependency-free modules run in both the main (Node) and renderer
    // (browser) processes, so they may use web-standard globals present in both
    // (e.g. URL, Date, Set).
    files: ['src/shared/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.node } }
  }
]
