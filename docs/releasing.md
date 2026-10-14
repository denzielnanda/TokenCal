# Release TokenCal

## Prepare a version

1. Run `npm ci`, `npm run check`, and `npm run test:desktop` on macOS and Windows with Node.js 24 LTS.
2. Verify the official pricing sources and update the dated list and accuracy documentation when needed.
3. Update `package.json`, the version in `electron/summary.ts`, and `CHANGELOG.md`; regenerate the lockfile with `npm install --package-lock-only`.
4. Commit the source to your public GitHub repository. Push an annotated matching version tag, for example `v0.2.0`.
5. Review the generated **draft** GitHub release, install each architecture on real hardware, and publish it when verified.

Version tags trigger native macOS and Windows jobs. Manual workflow runs produce downloadable workflow artifacts without creating a release. Built installers live under `release/`, which is ignored by Git.

## Signing

Unsigned local builds are useful for development; a polished public release should use platform signing. TokenCal never disables Gatekeeper or SmartScreen on the user's machine.

For macOS, configure repository secrets `CSC_LINK` (base64 or hosted Developer ID certificate), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. Electron Builder signs the app and can notarize using these credentials. Verify the result with `codesign --verify --deep --strict` and `spctl --assess --type execute`, and verify the DMG notarization before publication.

For Windows, configure `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for your signing certificate. Use your chosen signing service if certificate export is unavailable. Verify with the Windows SDK's `signtool verify` before publication. A new publisher may still encounter reputation checks.

Never commit certificates or signing credentials. The MacBook detector is compiled from the included Swift source and bundled as a universal executable. Verify its signature as part of the app’s deep validation.

A repository with no signing secrets can still build unsigned artifacts; its release notes must say so. User permission settings must not be weakened to hide signing failures. The macOS `afterPack` hook removes only FinderInfo and ResourceFork metadata from the newly generated bundle before signing; it preserves quarantine attributes.

## Local build commands

```sh
npm run dist:mac
npm run dist:win
```

Each command builds its platform's x64 and ARM64 installers and ZIP archives. Build on the matching host OS for signing and realistic installation testing. The application has no production native npm modules, allowing an unsigned Windows ZIP to be cross-packaged for inspection if useful, but cross-packaging does not validate Windows runtime behavior.

macOS packaging signs in a private temporary directory to prevent Finder/cloud metadata from being reapplied during signing, then copies the finished archives into `release/`. Use `npm run dist:mac -- --keep-unpacked --config.mac.identity=-` for a local ad-hoc build with unpacked apps retained for testing. Their location is saved in ignored `.cache/mac-build.json`. For a packaged smoke check, set `TOKENCAL_TEST_EXECUTABLE` to the app's `Contents/MacOS/TokenCal` executable and run `npm run test:desktop`.

`npm run dist:dir` builds the host architecture's unpacked application for a quick installation smoke check.

## Public repository readiness

The MIT license, readme, contributing guide, security policy, issue template, CI, release workflow, and sample screenshot are included. Enable GitHub's private vulnerability reporting. Exclude `.cache/`, environment files, generated installers, and real user logs. Set repository description to “Local-first token costs and AI coding usage limits in your menu bar.”
