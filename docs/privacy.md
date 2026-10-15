# Privacy

TokenCal has no account, analytics, crash-upload service, or update checker. It does not install hooks, status lines, or change agent configuration. Automatic Claude plan refresh uses Claude Code's existing access token to make a read-only usage request to Anthropic. It never reads browser cookies, Codex `auth.json`, or unrelated Keychain/Windows credential entries.

## Reads

Only Claude Code JSONL sessions, Codex JSONL sessions and adjacent archives, and Claude desktop usage history are scanned. Automatic discovery checks standard, environment-configured, and legacy locations. On Windows, it lists running WSL distributions and their default user homes; it does not start stopped distributions or open an interactive shell. Detection can be disabled and folders chosen explicitly in Settings. Source logs are opened read-only. Disabled providers contribute no records; their records are removed from the next saved cache. Session file symlinks are not followed.

The automatic Claude plan reader also checks Claude Code's saved login. For the standard Mac profile, a bundled Security.framework helper requests only the current user's `Claude Code-credentials` generic-password item. macOS controls permission; the first launch may ask, and later background attempts cannot display permission dialogs. An explicit TokenCal Refresh can retry. Custom profiles and Windows use `.credentials.json` beside the selected/discovered Claude session directory. Credential files are read-only, capped at 1 MiB, and symlinks are rejected. Only the access token, expiry, scope eligibility, and plan type are used. Refresh tokens and other login fields are not used or saved, and TokenCal never rewrites or renews credentials.

When enabled (the default), one `GET https://api.anthropic.com/api/oauth/usage` runs about every three minutes, or on an explicit refresh. The access token is sent only in the Authorization header to its issuer. Redirects are rejected, requests time out, response size is bounded, and provider rate-limit backoff also applies to manual refreshes. No conversation text, local paths, token-cost records, account email, or exports are sent. Tokens remain in main-process/helper memory, never renderer snapshots, logs, caches, crash uploads, or exported files. Disable **Refresh Claude plan usage automatically** to stop credential reads and network requests; local cost/session tracking continues. Login/account changes clear the previous in-memory quota before a new reading is accepted.

On Mac, the separate display helper reads screen dimensions and the camera cutout using public AppKit APIs. No screen pixels, camera, microphone, or accessibility data are captured. Widget coordinates are kept in memory and sent only to TokenCal's own interface.

Transcript lines may be decoded transiently in worker memory to extract usage. Prompt and response bodies, tool results, and code are not retained, rendered, exported, or uploaded.

## Saves

Electron's `userData` directory holds `settings.json` and `usage-cache.json`:

- macOS: `~/Library/Application Support/TokenCal/`
- Windows: `%APPDATA%/TokenCal/`

The cache contains source paths, read offsets, hashes, model IDs, token counts, project folder names, session/response identifiers, observed quotas, and timing. It contains no authentication data or conversation bodies. These are still personal metadata: keep exports and caches private if your project names are sensitive. File permissions are restricted to the user on platforms that support POSIX modes; Windows uses the current user's application-data directory and its inherited ACLs.

To clear TokenCal, quit from its tray menu, disable its login item if enabled, and delete its application-data directory. Agent logs remain untouched.

## Explicit actions

Export CSV opens a native save dialog and saves metadata to your chosen file. Provider pricing links open your normal browser only after clicking them. Optional desktop notifications expose usage percentages and cost on your screen. Launch at login changes only TokenCal's own OS login registration after you enable it.

Sample data is clearly labeled and does not replace, export, or modify real session records. Screenshots in this repository contain only fictional sample data.

## Renderer boundary

The UI is sandboxed with Node integration off and context isolation on. A narrow preload bridge exposes validated operations. IPC calls require a known first-party window and its main frame. External navigation, new windows, renderer permission requests, and remote renderer requests are blocked. Only the main-process Claude reader makes the fixed provider request described above. The packaged renderer loads bundled files through a constrained `tokencal://app/` protocol.
