# xcli

Simple CLI for the X API v2 (currently read-only).

## Install

```bash
npm i -g @stanley2058/xcli
# or
bun i -g @stanley2058/xcli

xcli --help
```

Or run:

```bash
npx @stanley2058/xcli --help
# or
bunx @stanley2058/xcli --help
```

## Usage

Examples:

```bash
# User lookup (inferred)
X_API_BEARER_TOKEN=... bun run xcli -- users XDevelopers
X_API_BEARER_TOKEN=... bun run xcli -- users 2244994945
X_API_BEARER_TOKEN=... bun run xcli -- users https://x.com/XDevelopers

# Post lookup (inferred)
X_API_BEARER_TOKEN=... bun run xcli -- posts 1228393702244134912
X_API_BEARER_TOKEN=... bun run xcli -- posts https://x.com/XDevelopers/status/1228393702244134912

# Download post attachment files (when media URLs are available)
X_API_BEARER_TOKEN=... bun run xcli -- posts 1228393702244134912 --download-media
X_API_BEARER_TOKEN=... bun run xcli -- posts 1228393702244134912 --expansions attachments.media_keys --media-fields media_key,type,url,preview_image_url --download-media

# Post search (recent or full archive)
X_API_BEARER_TOKEN=... bun run xcli -- posts search recent --query "from:XDevelopers -is:retweet"
X_API_BEARER_TOKEN=... bun run xcli -- posts search all --query "lang:en #ai -is:retweet"

# User search
X_API_BEARER_TOKEN=... bun run xcli -- users search --query "python developer"

# Trends by WOEID
X_API_BEARER_TOKEN=... bun run xcli -- trends 1
X_API_BEARER_TOKEN=... bun run xcli -- trends "new york"

# WOEID lookup (fuzzy)
bun run xcli -- trends search "new york"

# Explicit subcommands still supported
X_API_BEARER_TOKEN=... bun run xcli -- users by-username XDevelopers

# JSON output modes
X_API_BEARER_TOKEN=... bun run xcli -- users XDevelopers --json
X_API_BEARER_TOKEN=... bun run xcli -- users XDevelopers --json-pretty

# Field references
bun run xcli -- fields users
bun run xcli -- fields trends
```

Persistent config:

```json
{
  "bearerToken": "YOUR_X_API_BEARER_TOKEN"
}
```

- Save as `~/.config/xcli/config.json`.
- Precedence is: `--bearer-token` > env vars (`X_API_BEARER_TOKEN`, `BEARER_TOKEN`) > config file.

Notes:

- Default output is human-readable tables.
- Color output honors TTY, `NO_COLOR`, and `FORCE_COLOR`.
- Post tables include `Media`, `DL` (downloadable/total), and `Quote` (`false` or quoted post ID).
- In post text, media/quote `t.co` links are rewritten to placeholders like `[img1]` and `[quote]`.
- `trends search` uses a public WOEID index, fetched on demand and cached locally.
- Optional: set `XCLI_WOEID_CACHE_PATH` to override the default cache file path.

## Development

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run xcli -- --help
```
