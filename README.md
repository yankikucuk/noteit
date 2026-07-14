# NoteIt

A cross-platform sticky-notes desktop app — frameless notes that live on your
desktop, backed by a local SQLite database. Inspired by Simple Sticky Notes.

Built with **Electron + Vue 3 + better-sqlite3 + TipTap**. Runs on macOS
(Apple Silicon), Windows and Linux.

> The user interface ships in **Turkish and English** (switchable at runtime,
> defaulting to the OS locale). All source code, comments and documentation are
> in English.

## Features

- **Frameless sticky notes** — one window per note, draggable, with edge-snapping
  and title-bar alignment; positions persist across restarts.
- **Rich text** (TipTap): bold/italic/underline/strike, lists, **checklists**,
  highlight, links, **inline code & code blocks, images and tables**. Formatting
  menu appears on right-click.
- **Appearance** — 10 color themes, adjustable opacity, always-on-top, roll-up to
  the title bar.
- **Organization** — Explorer window with **full-text search (SQLite FTS5)**,
  sorting, **categories** and **colored tags**; trash with restore. The note list
  renders incrementally so large collections stay responsive.
- **Version history** — each note keeps periodic content snapshots; restore any
  earlier version (the restore is itself reversible).
- **Profiles** — isolated workspaces, each with its own notes/categories/tags,
  optional password lock.
- **Reminders** — per-note alarms with repeat modes; missed alarms fire on wake
  from sleep.
- **Locking** — lock a note's content, position and size (individually or all at
  once).
- **Backup & data portability** — manual and automatic daily backups (restore is
  validated before it overwrites your data); import/export all notes as portable
  JSON.
- **Internationalization** — Turkish and English dictionaries with a live language
  switch; adding a language is a single dictionary file.
- **System integration** — tray icon, global shortcuts (with conflict detection),
  launch at login, auto-update (with a restart prompt), local crash reporting.

## Development

Requires **Node ≥ 20.19** (see `.nvmrc` / `engines`).

```bash
npm install        # installs deps and rebuilds better-sqlite3 for Electron
npm run dev        # start with hot reload
npm run lint       # ESLint (flat config, zero disabled rules)
npm run format     # Prettier
npm test           # Vitest
npm run make-assets  # regenerate icons from SVG (sharp)
```

### Tests

`npm test` runs pure-module **unit tests** — password hashing, color palettes,
locale parity, toasts, alarm recurrence, export formatting (HTML→text, RTF),
search-query building, image detection and TipTap extension wiring — plus a
database/repository **integration** suite that exercises the real better-sqlite3
module (profiles, notes, tags, categories, FTS5 search, alarms, version history,
import/export, settings, migrations). Because better-sqlite3 is normally compiled
for Electron, the integration suite auto-skips on a dev machine and runs in CI,
which rebuilds it for Node. To run it locally: `npm rebuild better-sqlite3 &&
npm test`, then `npm run postinstall` to restore the Electron build.

Testable business logic lives in dependency-free modules under `src/shared/`
(`recurrence.js`, `exportFormat.js`, `search.js`) so it can be unit-tested
without pulling in Electron or the native database.

Continuous integration (`.github/workflows/ci.yml`) runs lint and the full test
suite (with better-sqlite3 rebuilt for Node), then builds the bundle on macOS,
Windows and Linux for every push and pull request.

## Building

```bash
npm run build:mac    # → dist/*.dmg + *.zip (arm64)
npm run build:win    # → dist/*.exe (nsis, x64)
npm run build:linux  # → dist/*.AppImage, *.deb
npm run pack:dir     # unpacked app in dist/ (quick smoke test, no installer)
```

Each script builds the renderer/main bundles (electron-vite) and then packages
with electron-builder (`electron-builder.yml`).

**Build each platform on that platform.** better-sqlite3 is a native module, so
its binary must be compiled for the target OS/arch — you cannot reliably produce
a Windows or Linux installer from macOS. Run each `build:*` script on its own OS,
or let CI do it: **[`.github/workflows/release.yml`](.github/workflows/release.yml)**
builds all three on macOS, Windows and Linux runners (each rebuilds the native
module for its platform) and uploads the installers as artifacts. Trigger it by
pushing a `v*` tag or from the Actions tab.

Code signing / notarization and auto-update publishing are configured in
`electron-builder.yml` but require your own certificates and credentials — see
the comments there. Unsigned builds set `CSC_IDENTITY_AUTO_DISCOVERY=false`.

## Architecture

```
src/
├── main/         Main process (Node)
│   ├── index.js       App lifecycle, CSP, crash reporter, schedulers
│   ├── database.js    SQLite: PRAGMAs, schema, indexes, FTS5, migrations, corruption recovery
│   ├── repository.js  Data access (profile-scoped): notes, search, versions, import/export
│   ├── windows.js     Note/Explorer/Options/Settings windows, snapping
│   ├── ipc.js         IPC handlers (error-wrapped)
│   ├── tray.js        Tray icon and menu
│   ├── menu.js        Application menu (Edit shortcuts, Preferences)
│   ├── alarms.js      Reminder scheduler (wakes on power resume)
│   ├── password.js    Profile password hashing (scrypt)
│   ├── updater.js     Auto-update (electron-updater) with restart prompt
│   ├── i18n.js        Main-process translation
│   └── logger.js      File + console logging (electron-log)
├── preload/      Context-isolated bridge (window.api)
├── shared/       Cross-process code
│   └── locales/       Flat i18n dictionaries (tr, en) + translate helpers
└── renderer/     Vue apps: note, explorer, options, settings
    └── src/
        ├── note/      Sticky-note window (editor, format bar, alarm & history dialogs)
        ├── explorer/  Explorer + profile manager
        ├── options/   Options popup window
        ├── settings/  Settings window
        ├── ui/        Reusable components (IconBtn, ToggleSwitch, TagChips, TagPicker, ToastHost)
        └── shared/    Colors, TipTap config, reactive i18n, toast store, image downscaling, focus trap
```

The schema evolves via `PRAGMA user_version` migrations in `database.js`: the
baseline is created idempotently, and each change to an existing table adds an
ordered migration entry so older installs upgrade cleanly.

### Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Content-Security-Policy header (strict in production).
- External links open in the system browser; in-app navigation is blocked.
- All SQL uses parameterised statements; note updates are column-whitelisted.
- Profile passwords are salted scrypt hashes compared in constant time.

> Note: the profile password is an *access lock*, not encryption — note contents
> are stored in plain text in the database.

## License

MIT — see [LICENSE](LICENSE).
