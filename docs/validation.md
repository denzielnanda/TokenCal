# Validation — 0.2.0

Verified on 2026-10-14.

| Check | Result |
| --- | --- |
| Regression tests, including incremental collection and accounting | 31 passed |
| Strict TypeScript and production renderer/main/worker builds | Passed |
| Packaged Apple Silicon Mac app: full desktop smoke test | Passed |
| Packaged Intel Mac app under Rosetta: full desktop smoke test | Passed |
| Deep, strict verification of both ad-hoc Mac app signatures | Passed |
| One-click combined Windows x64/ARM64 installer and architecture ZIPs | Passed |
| Windows executable PE architecture checks | Correct x64 and ARM64 |
| Dependency vulnerability audit | Zero known vulnerabilities |
| Real local history scan | 222 sessions from 271 logs, no parser warnings |

The desktop smoke test starts with **no settings file** and synthetic logs in an isolated home directory. It covers automatic first-launch discovery, token/cost values, renderer isolation, navigation, search, session details, saved settings, explicit widget expansion, selectable placement, tray popup, CSV formula escaping, and sample mode. Both packaged Mac architectures were checked against this MacBook’s real 185 × 33-point camera cutout: the native window is at y=0 and its readouts clear the camera gap. The universal Swift helper is included in both packages.

One cold Intel launch timed out during the first Rosetta test attempt; the retry passed all checks. The smoke launcher now allows 60 seconds for cold translated launches. Physical external-display selection and WSL mapping have regression coverage; this run did not include an attached external monitor or a Windows/WSL runtime.

The test runner uses isolated synthetic sessions and application data. It does not alter real agent logs, credentials, or login registration. The separate real-history diagnostic emits aggregate counts only and saves its metadata cache in ignored `.cache/`.

## Release status

macOS bundles use local ad-hoc signatures, not a Developer ID or notarization. Windows artifacts are unsigned and were cross-packaged on macOS; they have **not been run on a Windows machine**. The native Windows CI and release jobs are configured for that remaining validation. Signing, notarization, and public GitHub publication require the maintainer's accounts and certificates.

Costs are API-equivalent estimates, and Claude reset times are inferred where history permits. See [accuracy](accuracy.md). Version 0.2.0 local build archives have SHA-256 hashes in `release/TokenCal-0.2.0-SHA256SUMS.txt` and a license notice in `release/LICENSE.txt`; generated artifacts and real caches are excluded from Git.
