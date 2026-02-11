# xcli MVP

This workspace contains a Bun + TypeScript CLI that wraps the official X TypeScript SDK (`@xdevplatform/xdk`) for a small subset of X API v2: read-only lookup for users and posts.

## Included in MVP

- Bearer-token auth only (app-only)
- Commands:
  - Inferred default:
    - `xcli users <id|ids|username|usernames|url|urls>`
    - `xcli posts <id|ids|url|urls>`
  - Explicit subcommands (still supported):
    - `xcli users by-id <id>`
    - `xcli users by-username <username|@username>`
    - `xcli users by-ids <id...>`
    - `xcli users by-usernames <username...>`
    - `xcli posts by-id <id|url>`
    - `xcli posts by-ids <id...>`
  - `xcli fields users|posts` (quick references and doc links)
- Output:
  - Human-readable output by default (tables)
  - Color and styles, respecting TTY, `NO_COLOR`, and `FORCE_COLOR`
  - `--json` for compact JSON
  - `--json-pretty` for indented JSON
  - `--raw` to print status + headers + body (useful for debugging rate limits)
- Help:
  - `--help` at root and on subcommands, e.g. `xcli users --help`
  - `--help-all` for verbose help

## Not in MVP (explicit non-goals)

- OAuth 2.0 / OAuth 1.0a user-context flows (no `auth login`, no token refresh, no `users/me`)
- Any write actions (create/delete posts, likes, follows, bookmarks, etc.)
- Streaming endpoints
- Search endpoints (recent search, full-archive search)
- Pagination helpers (auto-fetching all pages); only single-page lookups are supported
- Caching, local storage, or persistence of results
- Config files (no `~/.config/xcli/...`), keychain integration, or interactive prompts
- Automatic rate-limit backoff / retry scheduling (beyond the SDK's basic retry settings)
- NDJSON and custom export formats (CSV, markdown, etc.)
- Shell completion generation
- Publishing as an npm package or compiled binary
- Automatic discovery of "all available fields" from OpenAPI at runtime
  - MVP provides `xcli fields ...` with doc links + common field lists; the authoritative source remains the data dictionary.

## Auth

Set one of:

- `X_API_BEARER_TOKEN` (recommended)
- `BEARER_TOKEN` (fallback)

Or pass `--bearer-token <token>`.

## References

- Fields overview: https://docs.x.com/x-api/fundamentals/fields
- Data dictionary: https://docs.x.com/x-api/fundamentals/data-dictionary
- Users lookup: https://docs.x.com/x-api/users/lookup/introduction
- Posts lookup: https://docs.x.com/x-api/posts/lookup/introduction
