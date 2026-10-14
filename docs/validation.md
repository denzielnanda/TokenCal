# Validation — 0.1.0

Verified on 2026-10-14.

| Check | Result |
| --- | --- |
| Regression tests, including incremental collection and accounting | 25 passed |
| Strict TypeScript and production renderer/main/worker builds | Passed |
| Packaged Apple Silicon Mac app: full desktop smoke test | Passed |
| Packaged Intel Mac app under Rosetta: full desktop smoke test | Passed |
| Deep, strict verification of both ad-hoc Mac app signatures | Passed |
| Windows x64 and ARM64 EXE/ZIP packaging, including combined installer | Passed |
| Windows executable PE architecture checks | Correct x64 and ARM64 |
| Dependency vulnerability audit | Zero known vulnerabilities |
| Real local history scan | 221 sessions from 270 logs, no parser warnings |

The desktop smoke test covers the collector, token/cost values, renderer isolation, navigation, search, session details, saved settings, explicit widget expansion, tray popup, CSV formula escaping, and sample mode. Native pointer hover was also checked on Apple Silicon; the explicit button is used for automated widget activation because floating-window resizing can confuse CDP hover under Rosetta.

The test runner uses isolated synthetic sessions and application data. It does not alter real agent logs, credentials, or login registration. The separate real-history diagnostic emits aggregate counts only and saves its metadata cache in ignored `.cache/`.

## Release status

macOS bundles use local ad-hoc signatures, not a Developer ID or notarization. Windows artifacts are unsigned and were cross-packaged on macOS; they have **not been run on a Windows machine**. The native Windows CI and release jobs are configured for that remaining validation. Signing, notarization, and public GitHub publication require the maintainer's accounts and certificates.

Costs are API-equivalent estimates, and Claude reset times are inferred where history permits. See [accuracy](accuracy.md). Local build archives have SHA-256 hashes in `release/SHA256SUMS.txt` and a license notice in `release/LICENSE.txt`; generated artifacts and real caches are excluded from Git.
