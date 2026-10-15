# Validation — 0.2.2

Verified on 2026-10-14.

| Check | Result |
| --- | --- |
| Regression tests, including automatic Claude login and usage fetching | 42 passed |
| Strict TypeScript and production renderer/main/worker builds | Passed |
| Packaged Apple Silicon Mac app: full desktop smoke test | Passed |
| Packaged Intel Mac app under Rosetta: full desktop smoke test | Passed |
| Deep, strict verification of both ad-hoc Mac app signatures | Passed |
| One-click combined Windows x64/ARM64 installer and architecture ZIPs | Passed |
| Windows executable PE architecture checks | Correct x64 and ARM64 |
| Dependency vulnerability audit | Zero known vulnerabilities |
| Real local history scan | 222 sessions from 271 logs, no parser warnings |

The desktop smoke test starts with **no settings file** and synthetic logs in an isolated home directory. It checks automatic Claude login detection using a fake credential file and mocked provider transport: live percentages, provider reset timestamps, no agent-settings changes, no credentials in snapshots, and disabling/fallback. Real Keychain reads and network requests are suppressed in this test. It also checks the native title bar, movability, display placement, drag regions, first-launch discovery, accounting, sandbox, navigation, settings, widget, tray, CSV escaping, and sample mode. Both Mac packages include universal display and Claude Keychain helpers.

The smoke launcher allows 60 seconds for cold translated launches. Both packaged Mac architectures passed the automatic-usage flow and deep strict local-signature checks. Window placement was exercised through the native Electron API on one display; physical dragging between monitors was not exercised. Windows x64/ARM64 packages were cross-built and PE architectures checked; native Windows/WSL runtime validation remains for CI or a Windows tester.

The public 0.2.2 app was opened against real local sources. Its automatic reader reached the macOS Keychain permission gate; a real Anthropic quota response has **not** been verified until the user grants access. No real Claude settings or login files were modified. Endpoint compatibility is based on the published provider implementation and response fixtures, not a completed live account test.

The test runner uses isolated synthetic sessions and application data. It does not alter real agent logs, credentials, or login registration. The separate real-history diagnostic emits aggregate counts only and saves its metadata cache in ignored `.cache/`.

## Release status

macOS bundles use local ad-hoc signatures, not a Developer ID or notarization. Windows artifacts are unsigned and were cross-packaged on macOS; they have **not been run on a Windows machine**. The native Windows CI and release jobs are configured for that remaining validation. Signing, notarization, and public GitHub publication require the maintainer's accounts and certificates.

Costs are API-equivalent estimates. Live Claude resets come from the provider; desktop fallback resets remain inferred where history permits. See [accuracy](accuracy.md). Version 0.2.2 archives have hashes in `release/TokenCal-0.2.2-SHA256SUMS.txt` and a license notice in `release/LICENSE.txt`; generated artifacts and real caches are excluded from Git.
