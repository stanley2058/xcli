# xcli

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run xcli -- --help
```

Examples:

```bash
# User lookup (inferred)
X_API_BEARER_TOKEN=... bun run xcli -- users XDevelopers
X_API_BEARER_TOKEN=... bun run xcli -- users 2244994945
X_API_BEARER_TOKEN=... bun run xcli -- users https://x.com/XDevelopers

# Post lookup (inferred)
X_API_BEARER_TOKEN=... bun run xcli -- posts 1228393702244134912
X_API_BEARER_TOKEN=... bun run xcli -- posts https://x.com/XDevelopers/status/1228393702244134912

# Explicit subcommands still supported
X_API_BEARER_TOKEN=... bun run xcli -- users by-username XDevelopers

# JSON output modes
X_API_BEARER_TOKEN=... bun run xcli -- users XDevelopers --json
X_API_BEARER_TOKEN=... bun run xcli -- users XDevelopers --json-pretty

# Field references
bun run xcli -- fields users
```

Notes:

- Default output is human-readable tables.
- Color output honors TTY, `NO_COLOR`, and `FORCE_COLOR`.

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
