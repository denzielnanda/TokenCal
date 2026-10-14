# Architecture

```text
Read-only local files
  → Collector worker (incremental JSONL parser)
  → Deduplicated usage metadata
  → Pricing + periods + sessions + quota age
  → Electron main process
  → Sandboxed renderer: dashboard, tray popup, top-edge widget
```

`electron/collector.ts` discovers files and maintains checkpoints by size, modification time, inode, completed-line offset, and SHA-256 of the last committed bytes. Shrinks, replacements, changed boundaries, and settings changes rebuild the appropriate metadata. Cache writes are atomic and use user-only permissions where supported. Cache corruption falls back to source logs. The cache is disposable, never authoritative.

`electron/parser.ts` extracts only usage and lifecycle metadata. Large irrelevant Codex records are filtered before JSON decoding. The 32 MiB line ceiling bounds memory. Partially written records are re-read from their beginning when completed. Claude messages may place the nested message type before the top-level record type; the parser supports that ordering.

`electron/summary.ts` deduplicates responses across files, clips periods, merges overlapping turns within a session, and separates unpriced tokens. All counts are computed off the UI thread. `electron/limits.ts` keeps observed quotas distinct from estimated resets. `src/shared/pricing.ts` holds dated rates and explicit modifiers.

`electron/main.ts` owns windows, native tray, dialogs, login registration, optional notifications, settings validation, and IPC sender validation. It rejects remote renderer requests and loads packaged assets through a custom protocol. The worker returns snapshots; the main process distributes them to the three UI surfaces. Refreshes never overlap; an in-progress scan queues one subsequent refresh.

`src/App.tsx` renders overview, sessions, insights, and compact surfaces. `src/SettingsView.tsx` handles local source paths, preferences, and price overrides. No renderer has direct filesystem or process access. Demo data lives in `src/demo.ts` and is never fed into the real collector.

Electron is chosen for one macOS/Windows implementation and native tray integration. It costs more memory than a Swift-only app. The top-edge widget is a frameless, always-on-top window centered on the primary screen, below the reserved menu area so the camera cutout cannot hide its text; it does not rely on private macOS notch APIs.

## Checks

`npm run check` runs regression tests and TypeScript/production builds. `npm run test:desktop` launches Electron with isolated synthetic files and checks accounting, renderer isolation, navigation, filtering, session detail, settings persistence, widget expansion, tray panel, and CSV formula escaping. It never changes your actual data or login registration.

`node scripts/check-local.mjs` is an optional developer diagnostic that reads this machine's real configured logs and prints aggregate counts only. Its cache is in ignored `.cache/`, which must never be published.
