# Contributing to TokenCal

1. Install Node.js 24 LTS and run `npm ci`. Mac builds also need Xcode Command Line Tools for the public AppKit display helper.
2. Run `npm run dev` for the desktop app. Frontend edits reload automatically; restart after changing `electron/` code.
3. Run `npm run check` and `npm run test:desktop` before submitting changes.

Keep source readers read-only. Never introduce credential access, uploads, or remote requests without a clear product decision and corresponding privacy/UI documentation. Add focused regression tests for accounting, new schemas, source changes, or reset inference. Fixtures must be synthetic and must not contain real prompts, session paths, organization IDs, keys, or user history.

When adding prices, use primary vendor documentation, record the date, update `docs/accuracy.md`, and test the relevant cache/tier/long-context rule. Unknown models should remain unpriced instead of inheriting a plausible rate.

Use [architecture](docs/architecture.md) for module responsibilities. The TC mark is defined in `assets/brand/mark.json` and shared with the interface. Run `npm run icons` after changing it to regenerate app and tray PNGs. Sharp is a developer-only dependency; downloaded apps require no graphics or compiler tools.

Issue reports should include TokenCal version, platform, provider version, and a short description. Avoid posting raw session transcripts or cache files. Include a minimal redacted/synthetic record only when needed to reproduce a parser issue.
