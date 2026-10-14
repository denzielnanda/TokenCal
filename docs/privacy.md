# Privacy

TokenCal has no account, analytics, crash-upload service, update checker, or background network request. It never reads browser cookies, `auth.json`, OAuth keys, macOS Keychain, or Windows credential storage. It does not install hooks or change agent configuration.

## Reads

Only Claude Code JSONL sessions, Codex JSONL sessions and adjacent archives, and Claude desktop usage history are scanned. Automatic discovery checks standard, environment-configured, and legacy locations. On Windows, it lists running WSL distributions and their default user homes; it does not start stopped distributions or open an interactive shell. Detection can be disabled and folders chosen explicitly in Settings. Source logs are opened read-only. Disabled providers contribute no records; their records are removed from the next saved cache. Session file symlinks are not followed.

On Mac, the bundled display helper reads screen dimensions and the camera cutout using public AppKit APIs. No screen pixels, camera, microphone, or accessibility data are captured. Widget coordinates are kept in memory and sent only to TokenCal's own interface.

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

The UI is sandboxed with Node integration off and context isolation on. A narrow preload bridge exposes validated operations. IPC calls require a known first-party window and its main frame. External navigation, new windows, permission requests, and background remote requests are blocked. The packaged renderer loads bundled files through a constrained `tokencal://app/` protocol.
