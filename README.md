# TokenCal

**Every token. In view.**

Estimated AI coding costs, session time, and usage limits in your menu bar or MacBook notch.

TokenCal is a free, open-source desktop companion for **Claude Code** and **Codex** on macOS and Windows. It reads the usage those tools already save on your computer. No new account, API key, or sign-in.

![TokenCal dashboard showing sample data](assets/screenshot-demo.png)

## What it does

- **Menu bar / system tray:** today's estimated USD, tokens, running sessions, and plan usage.
- **MacBook notch:** cost and session time sit beside the camera. Hover or click for tokens, five-hour/weekly usage, and resets. Automatic camera detection also works when an external monitor is primary.
- **Top-edge panel:** the same expandable widget on Windows and Macs without a notch.
- **Session tracking:** project, model, token breakdown, active work time, session span, and estimated cost.
- **Usage limits:** recorded five-hour, weekly, and model-specific windows, with reset countdowns and visible stale-data labels.
- **Dashboard:** daily charts, model and project breakdowns, local CSV export, price overrides, and optional usage notifications.

**Cost means API-equivalent value, not your subscription invoice.** Claude desktop history contains usage percentages but no official reset timestamps; inferred resets are marked `~`, and unknown reset times stay unknown. See [accuracy and sources](docs/accuracy.md).

## Download and use

1. Open this repository’s **Releases** page and download the installer for your computer: `mac-arm64.dmg` for Apple Silicon, `mac-x64.dmg` for Intel, or `windows-setup.exe` for Windows. The Windows installer selects x64 or ARM64 automatically.
2. On macOS 14 or later, drag **TokenCal** into **Applications** and open it. On Windows, run the installer; TokenCal starts when installation finishes.
3. Start a Claude Code or Codex session. TokenCal finds its logs automatically. Click the menu bar/tray icon for the quick panel. Enable **Show notch / top-edge widget** in **Settings** for the camera display.

No account, API key, terminal, Node.js, Xcode, or folder setup is required to use a downloaded app. Automatic detection covers native folders, custom agent homes, legacy Claude folders, and running WSL distributions. The first scan of a large history may take a few seconds. Source details and manual overrides are optional.

Move the dashboard by its system title bar, header, or TokenCal logo. The tray panel can be moved by its header too.

Closing the dashboard keeps TokenCal in the menu bar/tray. Right-click its icon to refresh, show the widget, or quit. Launch at login is optional.

Before a public release, the maintainer should sign and notarize installers. Current local builds use ad-hoc Mac signatures and unsigned Windows installers; see [validation](docs/validation.md) for the exact test and signing status.

## Source code versus the downloaded app

The full application source is here under the MIT license, including the MacBook display detector, local parsers, interface, and packaging scripts. **Users download the compiled app from Releases; they do not have to read, configure, or build the code.** Source archives are for contributors and people who want to inspect or modify it. Publishing binaries while hiding the source would be a closed-source distribution.

[Vorssaint](https://github.com/vorssaint/vorssaint-utils) follows the same separation: Swift code in `Sources`, ready-to-use apps in `Releases`.

## Run from source (contributors)

Use **Node.js 24 LTS** and npm on macOS or Windows. Building the macOS detector also needs Xcode Command Line Tools and macOS 14 or later.

```sh
npm ci
npm run dev
```

The dashboard and native tray start together. No agent credentials are accessed. Current build validation is recorded in [validation](docs/validation.md).

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

For agents inside WSL, running distributions and their default user homes are detected automatically through Windows-accessible folders such as `\\wsl.localhost\Ubuntu\home\you\.codex\sessions`. Stopped distributions are not started by TokenCal. Custom WSL agent homes can be chosen in source details. Cloud-only ChatGPT chats and remote sessions are not available unless their logs are on this computer.

Claude percentages require the Claude desktop history file, which may not be available in every desktop version. Without it, token costs and sessions still work. Codex limits update when Codex writes a new observation to its logs. TokenCal does not contact either vendor to refresh an account.

## Privacy

No analytics, telemetry, credential access, background network requests, hooks, or changes to agent configuration. Session logs are read-only. Parsing happens in a background worker; only usage metadata is retained. Source paths, session IDs, folder names, token counts, model names, and timing are cached locally, without conversation content. See [privacy](docs/privacy.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/architecture.md), and [SECURITY.md](SECURITY.md). Pricing lives in `src/shared/pricing.ts`; always cite the official source and add a focused regression test when adding formats or changing accounting.

## Acknowledgements and license

Research was informed by [Vorssaint's public usage-tracking documentation and source](https://github.com/vorssaint/vorssaint-utils/tree/main/Sources/Vorssaint/Services/AgentUsage). TokenCal has its own TypeScript implementation and UI; no Vorssaint code, branding, or assets are included.

MIT. Not affiliated with Anthropic or OpenAI.
