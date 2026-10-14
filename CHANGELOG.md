# Changelog

## 0.2.1 — 2026-10-14

- Restore the dashboard's native title bar and allow dragging the header, TokenCal logo, and tray-panel header. Dashboard placement is checked on every attached display.
- Explain stale Claude plan history with its last saved time and the menu-bar/tray refresh action; session tracking remains independent.

## 0.2.0 — 2026-10-14

- Real MacBook notch layout using public Apple display APIs, automatic cutout detection, external-monitor support, and selectable placement in Settings.
- Graphite and electric blue branding with a custom shared TC mark for app, tray, and interface.
- Automatic native, custom-home, legacy Claude, and running WSL log discovery; folder overrides are optional.
- First-launch desktop checks with no configuration file, plus notch geometry regression coverage.
- One-click Windows installation and download-first documentation separating full source code from ready-to-use releases.

## 0.1.0 — 2026-10-14

- macOS menu bar and Windows system tray app with an optional top-edge widget.
- Local Claude Code and Codex usage tracking, incremental worker collection, and metadata-only cache.
- Estimated token cost with cache and tier handling, unknown-price reporting, and local overrides.
- Observed usage quotas, exact Codex reset timestamps, estimated Claude resets, and stale-data labels.
- Dashboard, session details, daily charts, model/project insights, CSV export, optional alerts, and desktop preferences.
- Synthetic regression tests, desktop smoke checks, CI, native packaging, and draft release workflow.
