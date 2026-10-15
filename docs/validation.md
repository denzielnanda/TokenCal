# Validation — 0.2.3

Verified on 2026-10-14.

| Check | Result |
| --- | --- |
| Regression tests, including no-login defaults, upgrade migration, and optional account fetching | 43 passed |
| Strict TypeScript and production renderer/main/worker builds | Passed |
| Packaged Apple Silicon Mac app: full desktop smoke test | Passed |
| Packaged Intel Mac app under Rosetta: full desktop smoke test | Passed |
| Deep, strict verification of both ad-hoc Mac app signatures | Passed |
| One-click combined Windows x64/ARM64 installer and architecture ZIPs | Passed |
| Windows executable PE architecture checks | Correct x64 and ARM64 |
| Dependency vulnerability audit | Zero known vulnerabilities |
| Real local history scan | 222 sessions from 271 logs, no parser warnings |

The desktop smoke test starts with **no settings file** and synthetic logs in an isolated home. Default startup and explicit Refresh use desktop history with zero provider requests, even when a fake login file exists. Cancelling optional account consent keeps local mode and makes no request. Only confirmed account mode reads the synthetic login and mocked quotas. No real credentials or network requests are used. The test also covers accounting, sandboxing, navigation, native title bar/movability, settings, widget, tray, CSV escaping, and sample mode.

The smoke launcher allows 60 seconds for cold translated launches. Packaged Mac architectures are checked against the local-default/optional-consent flow and deep strict local signatures. Window placement uses the native Electron API on one display; physical dragging between monitors is not exercised. Windows x64/ARM64 installers are cross-built with PE architecture checks. The preceding 0.2.2 revision passed native Mac and Windows GitHub CI; checks for this corrected default are rerun on the public review branch.

No real Claude settings or login files are modified. The optional API integration is covered by published response fixtures, not a verified live authenticated quota response. Local tracking and desktop history need no account access. The old preview's automatic flag is ignored on upgrade, so it cannot silently opt an installation into the optional account source.

The test runner uses isolated synthetic sessions and application data. It does not alter real agent logs, credentials, or login registration. The separate real-history diagnostic emits aggregate counts only and saves its metadata cache in ignored `.cache/`.

## Release status

macOS bundles use local ad-hoc signatures, not a Developer ID or notarization. Windows artifacts are unsigned and were cross-packaged on macOS; they have **not been run on a Windows machine**. The native Windows CI and release jobs are configured for that remaining validation. Signing, notarization, and public GitHub publication require the maintainer's accounts and certificates.

Costs are API-equivalent estimates. Default Claude desktop resets are inferred where history permits; optional account resets come from the provider. See [accuracy](accuracy.md). Version 0.2.3 archives have hashes in `release/TokenCal-0.2.3-SHA256SUMS.txt` and a license notice in `release/LICENSE.txt`; generated artifacts and real caches are excluded from Git.
