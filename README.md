# TokenCal

**Know what your AI coding sessions cost. Right from your menu bar.**

TokenCal is a free, open-source desktop companion for **Claude Code** and **Codex** on macOS and Windows. It reads the usage those tools already save on your computer. No new account, API key, or sign-in.

![TokenCal dashboard showing sample data](assets/screenshot-demo.png)

## What it does

- **Menu bar / system tray:** today's estimated USD, tokens, running sessions, and plan usage.
- **Optional top-edge widget:** hover to expand a compact usage panel on either platform, including Macs without a notch.
- **Session tracking:** project, model, token breakdown, active work time, session span, and estimated cost.
- **Usage limits:** recorded five-hour, weekly, and model-specific windows, with reset countdowns and visible stale-data labels.
- **Dashboard:** daily charts, model and project breakdowns, local CSV export, price overrides, and optional usage notifications.

**Cost means API-equivalent value, not your subscription invoice.** Claude desktop history contains usage percentages but no official reset timestamps; inferred resets are marked `~`, and unknown reset times stay unknown. See [accuracy and sources](docs/accuracy.md).

## Run from source

Use **Node.js 24 LTS** and npm on macOS or Windows. macOS packaging also needs Xcode Command Line Tools, which provide the system Python used to prepare generated bundles for signing.

```sh
npm ci
npm run dev
```

TokenCal opens the dashboard and puts an icon in your menu bar or tray. Start a Claude Code or Codex session to see your usage. The first scan of a large history can take a few seconds; later scans process only changed files.

Click the tray icon for the quick panel. Right-click it to open the dashboard, refresh, toggle the widget, or quit. Closing the dashboard leaves the tray app running. Enable the top-edge widget or launch at login in **Settings**.

## Build installers

```sh
npm run check
npm run test:desktop
npm run dist:mac   # on macOS: DMG + ZIP for Apple Silicon and Intel
npm run dist:win   # on Windows: NSIS installer + ZIP for x64 and ARM64
```

Outputs go into `release/`. Build a local unpacked app with `npm run dist:dir`. Signing and notarization require your own platform certificates; see [release instructions](docs/releasing.md). The included GitHub Actions workflows build on both operating systems and create a **draft** release when you push a version tag.

## How no-sign-in tracking works

| Source | Information used |
| --- | --- |
| `~/.claude/projects/**/*.jsonl` | Per-response tokens, model, timestamp, project folder name, turn boundaries |
| `~/.codex/sessions/**/*.jsonl` and `archived_sessions` | Response usage records or legacy token totals, model, turn boundaries, recorded account limits |
| Claude desktop's `plan-usage-history.json` | Latest usage percentages and history of usage drops |

`CLAUDE_CONFIG_DIR` and `CODEX_HOME` are respected. Older `~/.config/claude/projects` installations are detected. All source paths can be changed in Settings. Claude desktop history is searched in `~/Library/Application Support/Claude` on macOS and `%APPDATA%/Claude` on Windows.

For agents inside WSL, use the folder picker to select their Windows-accessible session folders, such as `\\wsl.localhost\Ubuntu\home\you\.codex\sessions`. Auto-detection only covers the host user's native folders. Cloud-only ChatGPT chats and remote sessions are not available unless their logs are on this computer.

Claude percentages require the Claude desktop history file, which may not be available in every desktop version. Without it, token costs and sessions still work. Codex limits update when Codex writes a new observation to its logs. TokenCal does not contact either vendor to refresh an account.

## Privacy

No analytics, telemetry, credential access, background network requests, hooks, or changes to agent configuration. Session logs are read-only. Parsing happens in a background worker; only usage metadata is retained. Source paths, session IDs, folder names, token counts, model names, and timing are cached locally, without conversation content. See [privacy](docs/privacy.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/architecture.md), and [SECURITY.md](SECURITY.md). Pricing lives in `src/shared/pricing.ts`; always cite the official source and add a focused regression test when adding formats or changing accounting.

## Acknowledgements and license

Research was informed by [Vorssaint's public usage-tracking documentation and source](https://github.com/vorssaint/vorssaint-utils/tree/main/Sources/Vorssaint/Services/AgentUsage). TokenCal has its own TypeScript implementation and UI; no Vorssaint code, branding, or assets are included.

MIT. Not affiliated with Anthropic or OpenAI.
