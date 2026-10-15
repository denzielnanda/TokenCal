<div align="center">

<img src="assets/readme/hero.png" alt="TokenCal — Every token. In view. Local AI coding costs and usage limits for macOS and Windows." width="100%">

# TokenCal

**A little clarity for your AI coding workflow.**

Token costs, session time, and usage limits for **Claude Code** and **Codex**,\
in your menu bar, system tray, or MacBook notch.

[![Checks](https://github.com/denzielnanda/TokenCal/actions/workflows/ci.yml/badge.svg)](https://github.com/denzielnanda/TokenCal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-397dff)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows-242c3d)](#get-tokencal)
[![Early preview](https://img.shields.io/badge/status-early%20preview-c5a582)](#get-tokencal)

[**Get started**](#get-tokencal) · [Features](#made-for-the-way-you-code) · [How it works](#how-it-works) · [Contribute](CONTRIBUTING.md) · [Report a bug](https://github.com/denzielnanda/TokenCal/issues/new?template=bug.yml)

</div>

---

## Your usage, at a glance

See what your coding sessions are using without opening another dashboard in your browser. TokenCal reads the usage your tools already save on your computer, turns it into a clear daily overview, and keeps the essentials one click away.

**Free and open source. No TokenCal account or API key required. Your session data stays on your device.**

<img src="assets/screenshot-demo.png" alt="TokenCal dashboard with daily API-equivalent cost, tokens, session time, Claude Code and Codex usage windows, a weekly chart, and recent sessions." width="100%">

<p align="center"><sub>The app in sample mode. All values above are synthetic demonstration data.</sub></p>

## Made for the way you code

| | What you get |
| :--- | :--- |
| **A glance, wherever you work** | Today's estimated cost, tokens, active sessions, and plan usage in your menu bar or Windows tray. |
| **A home beside the camera** | A MacBook notch widget with expandable details. A top-edge panel on other Macs and Windows. |
| **Every session in context** | Project, model, input/output/cache tokens, active work time, session span, and estimated cost. |
| **Usage windows with context** | Recorded five-hour, weekly, and model-specific limits, reset countdowns, and clear labels when observations are stale. |
| **The bigger picture** | Daily charts, model and project breakdowns, local CSV export, price overrides, and optional usage notifications. |

> **An estimate, not an invoice.** Costs represent the API-equivalent value of recorded tokens. They do not represent your subscription charge or remaining plan allowance. Unknown prices and reset times stay unknown. [Read the accuracy notes →](docs/accuracy.md)

## Get TokenCal

**TokenCal is an early preview. Source is available now; downloadable installers have not been published yet.** Follow the [Releases page](https://github.com/denzielnanda/TokenCal/releases) for packaged builds. Current signing and platform validation are documented in [validation](docs/validation.md).

### Run from source

Install **Node.js 24 LTS**, then run:

```sh
git clone https://github.com/denzielnanda/TokenCal.git
cd TokenCal
npm ci
npm run dev
```

The dashboard and native tray start together. On macOS, use **macOS 14 or later** with Xcode Command Line Tools for the display helper. Windows builds do not require Xcode.

1. Start a Claude Code or Codex session. TokenCal discovers supported local logs automatically.
2. Click the menu bar or tray icon for a quick overview.
3. Enable **Show notch / top-edge widget** in Settings to keep usage beside your work.

Large histories may take a few seconds to scan. Move the dashboard by its title bar, header, or TokenCal logo. Closing the dashboard keeps the app in the menu bar or tray; right-click the icon to refresh, show the widget, or quit.

<details>
<summary><strong>Installer guide — for future packaged releases</strong></summary>

| Your computer | Package |
| :--- | :--- |
| Apple Silicon Mac | `TokenCal-<version>-mac-arm64.dmg` |
| Intel Mac | `TokenCal-<version>-mac-x64.dmg` |
| Windows x64 or ARM64 | `TokenCal-<version>-windows-setup.exe` — selects the architecture automatically |

On macOS, drag TokenCal into Applications. On Windows, run the installer. Packaged apps need no terminal, Node.js, Xcode, or folder setup. Launch at login is optional.

Local Mac builds currently use ad-hoc signatures; Windows builds are unsigned. Signing and notarization remain part of release preparation. See [release instructions](docs/releasing.md).

</details>

## How it works

```text
Claude Code / Codex local logs
              ↓
  Read-only background parser
              ↓
  Usage metadata on your device
              ↓
   Dashboard · tray · notch
```

| Local source | What TokenCal reads |
| :--- | :--- |
| Claude Code project logs | Per-response tokens, model, timestamps, project names, and turn boundaries |
| Codex session and archived-session logs | Response usage or legacy token totals, models, turn boundaries, and recorded account limits |
| Claude desktop's `plan-usage-history.json` | Saved usage percentages and the history of usage drops |

Claude percentages depend on a local history file that is not available in every desktop version. Codex limits update when a new observation is written to its logs. Cloud-only ChatGPT chats and remote sessions need local logs to appear here.

<details>
<summary><strong>Custom folders, WSL, and source details</strong></summary>

- Claude Code defaults to `~/.claude/projects/**/*.jsonl`; older `~/.config/claude/projects` installations are detected.
- Codex defaults to `~/.codex/sessions/**/*.jsonl` and `archived_sessions`.
- `CLAUDE_CONFIG_DIR` and `CODEX_HOME` are respected. All source paths can be changed in Settings.
- Claude desktop history is searched in `~/Library/Application Support/Claude` on macOS and `%APPDATA%/Claude` on Windows.
- On Windows, running WSL distributions and their default user homes are detected automatically. TokenCal does not start stopped distributions. Choose custom WSL agent homes in source details.

Claude desktop history has usage percentages but no official reset timestamps. Inferred reset times are marked `~`; unknown reset times remain unknown. [Source and accounting details →](docs/accuracy.md)

</details>

## Private by design

The published app reads session logs locally and keeps usage metadata on your computer. It has **no analytics, telemetry, credential access, or background network requests**. It does not retain conversation content, add hooks, or change your agent configuration.

Cached metadata includes source paths, session IDs, project folder names, token counts, models, and timing. [Read the privacy guide →](docs/privacy.md)

## Build something useful with us

Bug reports, parser fixes, platform testing, and interface improvements are welcome. Start with the [contributing guide](CONTRIBUTING.md). Use synthetic or redacted examples when reporting an issue; keep real transcripts and credentials out of public posts.

```sh
npm run check          # regression tests + production build
npm run test:desktop   # desktop smoke test with synthetic logs
npm run dist:mac       # macOS DMG + ZIP, Apple Silicon and Intel
npm run dist:win       # Windows installer + ZIP, x64 and ARM64
```

Build installers on the matching operating system. Outputs go into `release/`. The GitHub workflows check macOS and Windows; a version tag starts packaging and creates a **draft** release for review.

| Explore | |
| :--- | :--- |
| [Architecture](docs/architecture.md) | App structure and module responsibilities |
| [Accuracy and sources](docs/accuracy.md) | Accounting rules, pricing, and reset inference |
| [Validation](docs/validation.md) | What has been tested and remaining platform checks |
| [Release guide](docs/releasing.md) | Packaging, signing, and publication |
| [Security policy](SECURITY.md) | How to report a vulnerability privately |

## Acknowledgements

Research was informed by [Vorssaint's public usage-tracking documentation and source](https://github.com/vorssaint/vorssaint-utils/tree/main/Sources/Vorssaint/Services/AgentUsage). TokenCal uses its own TypeScript implementation, interface, and brand assets.

---

<div align="center">

**Every token. In view.**

[MIT licensed](LICENSE) · Built for the open-source community · Not affiliated with Anthropic or OpenAI

</div>
