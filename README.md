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
# User lookup
X_API_BEARER_TOKEN=... bun run xcli -- users by-username XDevelopers --pretty

# Post lookup (ID or URL)
X_API_BEARER_TOKEN=... bun run xcli -- posts by-id 1228393702244134912 --pretty
X_API_BEARER_TOKEN=... bun run xcli -- posts by-id https://x.com/XDevelopers/status/1228393702244134912 --pretty

# Field references
bun run xcli -- fields users
```

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
