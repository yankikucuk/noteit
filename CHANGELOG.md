# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Sticky notes: frameless windows, 10 color themes, opacity, always-on-top,
  roll-up to title bar, edge-snapping with title-bar alignment.
- Rich text editing (TipTap): formatting, lists, checklists, highlight, links,
  inline code & code blocks, images and tables; right-click formatting menu.
- Explorer: full-text search (SQLite FTS5), sorting, categories, colored tags,
  trash with restore, merge; incremental rendering for large lists.
- Note version history: periodic content snapshots with reversible restore.
- Internationalization: Turkish and English UI with a live language switch.
- Data portability: import/export all notes as portable JSON.
- Pasted/dropped images are downscaled before embedding to keep notes small.
- Explorer and Settings windows remember their size and position.
- Manual "Check for Updates" alongside periodic background checks.
- Profiles: isolated workspaces with optional password lock.
- Reminders with repeat modes (re-checked on wake from sleep); per-note and bulk
  locking.
- Backup: manual and automatic daily backups; restore validated before it
  overwrites data.
- Toast notifications and global error surfacing (window + Vue error handlers).
- Accessible modals: focus trap, initial focus and focus restoration.
- System integration: tray, global shortcuts (with conflict detection), launch at
  login, auto-update with a restart prompt, local crash reporting.
- Settings window (language, launch at login, default note color, backup,
  data import/export, about).
- Application menu with standard editing shortcuts.

### Security

- `sandbox: true`, `contextIsolation: true`, strict Content-Security-Policy.
- External-link hardening (open in system browser, block in-app navigation).
- Parameterised SQL and column-whitelisted updates.
- Salted scrypt password hashing with constant-time comparison.

### Infrastructure

- `PRAGMA user_version` schema-migration framework for future schema changes.
- Database corruption recovery, global error logging (electron-log).
- ESLint (zero disabled rules) + Prettier; Vitest unit tests plus a
  database/repository integration suite (runs against a Node build of
  better-sqlite3, auto-skips where it is built for Electron).
- GitHub Actions CI: lint, full test suite, and multi-OS build.
- Release workflow packages installers on macOS, Windows and Linux runners
  (dmg + zip, nsis, AppImage + deb); native module rebuilt per platform.
- `engines` / `.nvmrc` pin Node ≥ 20.19.
- English JSDoc across the codebase.
