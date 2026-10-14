# Security

Please use the GitHub repository's **Security → Report a vulnerability** private reporting flow when enabled. If it is unavailable, contact the repository owner privately through their GitHub profile. Do not post credentials, raw transcripts, user caches, or exploitable details in a public issue.

Supported code is the latest released version and `main`. The application reads local untrusted log files and uses a sandboxed renderer with a validated IPC bridge. See [privacy](docs/privacy.md) for storage and access boundaries.

Maintainers should keep Electron current, run `npm audit`, test packaging after dependency overrides, and review parser changes for bounded memory, prototype/key safety, and data minimization. No authentication tokens should ever be collected or logged.
