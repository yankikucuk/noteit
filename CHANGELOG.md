# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Security

- Changing or removing a profile password now requires the current password.
- Opening a note by id is restricted to the active profile; the command palette
  verifies a profile switch succeeded before opening a cross-profile result.
- Imported Markdown/JSON note HTML is sanitised (script elements, inline event
  handlers, `javascript:`/`vbscript:`/non-image `data:` URLs).

### Fixed

- Trashed notes can no longer be opened from the trash; restore them first.
  Restoring returns a note fully to the active list (archive flag included).
- Linux: note windows now snap and persist their position live (the `moved`
  event never fires there); Explorer/Settings positions are saved on close.
- Reminders in non-active profiles fire as system notifications instead of
  being silently skipped; locked profiles get a content-free notification.
- JSON export (v2) now round-trips archive state and reminders.
- Moving or resizing a note no longer marks it as recently updated.
- Reminder input is validated (finite trigger time, known repeat mode).

### Performance

- The full-text index is no longer rebuilt from scratch on every launch.
- Typing no longer echoes the full note content back to the editing window,
  and Explorer refreshes coalesce bursts of updates into one reload.
- Bulk actions run in a single transaction.
- The editor serialises the document once per edit instead of three times.
- The opacity slider previews live and persists only on release.
- Version snapshots skip oversized (image-heavy) content; text search results
  are capped; Explorer side lists load in parallel.

### Infrastructure

- Note field updates are type-validated per column (malformed values dropped).
- Profile switching extracted to its own module shared by IPC, auto-lock and
  the reminder scheduler.

## [1.0.1] - 2026-07-16

### Added

- Command palette (Cmd/Ctrl+K) for quick actions and note search.
- Cross-profile global search from the command palette; password-protected
  profiles are excluded.
- Saved filters: store a category/tag/sort combination as a one-click preset.
- Note archive and multi-select bulk actions (categorize, star, archive, trash).
- Reminder snooze (10 minutes / 1 hour / tomorrow) when a reminder fires.
- Agenda of upcoming reminders in the Explorer, with overdue/today/tomorrow
  labels and a pending count.
- Custom reminder repeat rules: every N days, or on selected weekdays.
- `noteit://` URL scheme for deep links (`note/<id>`, `new`, `explorer`) and a
  "copy link" action; note links resolve only within the active profile.
- Idle auto-lock for password-protected profiles (off / 5 / 15 / 30 minutes).
- Per-note pomodoro focus timer (25/5) with pause and stop.
- Note output: copy as Markdown, export PNG/PDF, print, and Markdown import.
- Appearance: light/dark/system theme, custom note colors, and an option to dim
  unfocused note windows.
- Configurable global shortcuts; new notes open on the active display.
- Deletable tags and categories, and custom in-app dialogs replacing the native
  prompt/confirm.

### Changed

- Explorer search and the command palette debounce their queries, issuing one
  lookup per pause instead of a round-trip per keystroke; the palette runs its
  two searches in parallel and ignores out-of-order results.

### Security

- Global search never surfaces notes from password-protected profiles, and
  `noteit://` note links cannot reach a locked profile.

### Infrastructure

- 64-bit-only builds with a native Windows arm64 target; Node 26 pinned; the
  release workflow merges multi-arch Windows update metadata.

## [1.0.0] - 2026-07-14

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
- Release workflow packages installers on macOS, Windows (x64 and native arm64)
  and Linux runners (dmg + zip, nsis x64 + arm64, AppImage + deb) and publishes
  them to a GitHub Release; native module rebuilt per platform.
- 64-bit only: all targets build arm64/x64 — no 32-bit (ia32/armv7l).
- `engines` / `.nvmrc` pin Node 26.
- English JSDoc across the codebase.
