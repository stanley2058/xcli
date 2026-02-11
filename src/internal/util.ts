export type ParsedUserInput =
  | { kind: "id"; value: string; source: string }
  | { kind: "username"; value: string; source: string }
  | { kind: "invalid"; source: string; reason: string };

export type ParsedPostInput =
  | { kind: "id"; value: string; source: string }
  | { kind: "invalid"; source: string; reason: string };

const RESERVED_USER_PATHS = new Set([
  "about",
  "compose",
  "explore",
  "hashtag",
  "home",
  "i",
  "intent",
  "login",
  "messages",
  "notifications",
  "privacy",
  "search",
  "settings",
  "share",
  "signup",
  "tos",
]);

export function printLine(s: string): void {
  process.stdout.write(s + "\n");
}

export function printError(message: string): void {
  process.stderr.write(message + "\n");
}

export function jsonPrint(value: unknown, opts: { pretty: boolean }): void {
  const text = opts.pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  process.stdout.write(text + "\n");
}

export function isProbablyUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

export function isNumericId(input: string): boolean {
  return /^\d+$/.test(input);
}

export function isLikelyUsername(input: string): boolean {
  return /^[A-Za-z0-9_]{1,50}$/.test(input);
}

export function normalizeUsername(input: string): string {
  return input.startsWith("@") ? input.slice(1) : input;
}

export function extractPostId(url: string): string | undefined {
  // Supports URLs like:
  // https://x.com/<user>/status/<id>
  // https://twitter.com/<user>/status/<id>
  // https://x.com/i/web/status/<id>
  const m = url.match(/\/status\/(\d+)/);
  if (m?.[1]) return m[1];

  const m2 = url.match(/\/i\/web\/status\/(\d+)/);
  if (m2?.[1]) return m2[1];

  return undefined;
}

function normalizeHost(hostname: string): string {
  const h = hostname.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

function parseUrl(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

function extractUserFromProfilePath(pathname: string): string | undefined {
  const segments = pathname
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  if (segments.length === 0) return undefined;

  // /i/user/<id>
  if (segments[0] === "i" && segments[1] === "user" && isNumericId(segments[2] ?? "")) {
    return `id:${segments[2]}`;
  }

  const first = normalizeUsername(decodeURIComponent(segments[0]!));
  if (RESERVED_USER_PATHS.has(first.toLowerCase())) return undefined;
  if (!isLikelyUsername(first)) return undefined;

  return `username:${first}`;
}

function extractUserFromStatusPath(pathname: string): string | undefined {
  const segments = pathname
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  if (segments.length < 3) return undefined;
  if (segments[1] !== "status") return undefined;

  const username = normalizeUsername(decodeURIComponent(segments[0]!));
  if (!isLikelyUsername(username)) return undefined;

  return username;
}

export function parseUserInput(source: string): ParsedUserInput {
  if (isProbablyUrl(source)) {
    const parsed = parseUrl(source);
    if (!parsed) {
      return { kind: "invalid", source, reason: "Invalid URL." };
    }

    const host = normalizeHost(parsed.hostname);
    if (host !== "x.com" && host !== "twitter.com") {
      return { kind: "invalid", source, reason: "URL must be on x.com or twitter.com." };
    }

    const statusUser = extractUserFromStatusPath(parsed.pathname);
    if (statusUser) {
      return { kind: "username", value: statusUser, source };
    }

    const profile = extractUserFromProfilePath(parsed.pathname);
    if (!profile) {
      return {
        kind: "invalid",
        source,
        reason: "Could not determine a user from URL.",
      };
    }

    if (profile.startsWith("id:")) {
      return { kind: "id", value: profile.slice(3), source };
    }

    return { kind: "username", value: profile.slice(9), source };
  }

  if (isNumericId(source)) {
    return { kind: "id", value: source, source };
  }

  const username = normalizeUsername(source);
  if (isLikelyUsername(username)) {
    return { kind: "username", value: username, source };
  }

  return {
    kind: "invalid",
    source,
    reason: "Expected an ID, username, or x.com/twitter.com URL.",
  };
}

export function parsePostInput(source: string): ParsedPostInput {
  if (isProbablyUrl(source)) {
    const parsed = parseUrl(source);
    if (!parsed) {
      return { kind: "invalid", source, reason: "Invalid URL." };
    }

    const host = normalizeHost(parsed.hostname);
    if (host !== "x.com" && host !== "twitter.com") {
      return { kind: "invalid", source, reason: "URL must be on x.com or twitter.com." };
    }

    const id = extractPostId(source);
    if (!id) {
      return {
        kind: "invalid",
        source,
        reason: "Could not determine a Post ID from URL.",
      };
    }

    return { kind: "id", value: id, source };
  }

  if (isNumericId(source)) {
    return { kind: "id", value: source, source };
  }

  return {
    kind: "invalid",
    source,
    reason: "Expected a numeric Post ID or x.com/twitter.com status URL.",
  };
}

export function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  if (max <= 1) return input.slice(0, max);
  return `${input.slice(0, max - 1)}...`;
}

export function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDateShort(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;

  const forceColor = process.env.FORCE_COLOR;
  if (forceColor !== undefined) {
    return forceColor !== "0";
  }

  return Boolean(process.stdout.isTTY);
}

export function getUsableTerminalWidth(fallback = 80): number {
  const columns = process.stdout.columns;
  if (process.stdout.isTTY && typeof columns === "number" && Number.isFinite(columns) && columns > 0) {
    return Math.max(40, Math.trunc(columns));
  }
  return fallback;
}

function wrapAnsi(text: string, code: string, enabled: boolean): string {
  if (!enabled) return text;
  return `\u001B[${code}m${text}\u001B[0m`;
}

export function style(text: string, token: "bold" | "dim" | "red" | "yellow" | "green" | "cyan" | "magenta"): string {
  const enabled = colorEnabled();
  if (token === "bold") return wrapAnsi(text, "1", enabled);
  if (token === "dim") return wrapAnsi(text, "2", enabled);
  if (token === "red") return wrapAnsi(text, "31", enabled);
  if (token === "yellow") return wrapAnsi(text, "33", enabled);
  if (token === "green") return wrapAnsi(text, "32", enabled);
  if (token === "cyan") return wrapAnsi(text, "36", enabled);
  return wrapAnsi(text, "35", enabled);
}

export function stripAnsi(input: string): string {
  return input.replace(/\u001B\[[0-9;]*m/g, "");
}

function padRight(input: string, width: number): string {
  const len = stripAnsi(input).length;
  if (len >= width) return input;
  return input + " ".repeat(width - len);
}

type TableRenderOptions = {
  maxWidth?: number;
  minColWidth?: number;
  minWidths?: number[];
};

function wrapPlainText(input: string, width: number): string[] {
  if (width <= 1) {
    return input.length === 0 ? [""] : input.split("").map((ch) => ch);
  }

  const chunks: string[] = [];
  const segments = input.split("\n");

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
      chunks.push("");
      continue;
    }

    const words = trimmed.split(/\s+/);
    let line = "";

    for (const word of words) {
      if (word.length > width) {
        if (line.length > 0) {
          chunks.push(line);
          line = "";
        }

        for (let i = 0; i < word.length; i += width) {
          chunks.push(word.slice(i, i + width));
        }
        continue;
      }

      if (line.length === 0) {
        line = word;
        continue;
      }

      if (line.length + 1 + word.length <= width) {
        line += ` ${word}`;
      } else {
        chunks.push(line);
        line = word;
      }
    }

    if (line.length > 0) chunks.push(line);
  }

  return chunks.length > 0 ? chunks : [""];
}

export function wrapText(input: string, width: number): string[] {
  const plain = stripAnsi(input);
  if (plain.length <= width) return [input];
  return wrapPlainText(plain, width);
}

function shrinkWidthsToFit(widths: number[], minWidths: number[], maxWidth: number): number[] {
  const out = [...widths];
  const separatorWidth = Math.max(0, out.length - 1) * 2;

  const total = (): number => out.reduce((sum, n) => sum + n, 0) + separatorWidth;

  while (total() > maxWidth) {
    let candidate = -1;
    let bestSlack = 0;

    for (let i = 0; i < out.length; i += 1) {
      const slack = out[i]! - (minWidths[i] ?? 1);
      if (slack >= bestSlack) {
        bestSlack = slack;
        candidate = i;
      }
    }

    if (candidate === -1 || bestSlack <= 0) break;
    const current = out[candidate];
    if (typeof current !== "number") break;
    out[candidate] = current - 1;
  }

  return out;
}

export function renderTable(headers: string[], rows: string[][], opts?: TableRenderOptions): string[] {
  if (headers.length === 0) return [];

  const widths = headers.map((h) => stripAnsi(h).length);
  for (const row of rows) {
    for (let i = 0; i < headers.length; i += 1) {
      const cell = row[i] ?? "";
      widths[i] = Math.max(widths[i]!, stripAnsi(cell).length);
    }
  }

  const minBase = opts?.minColWidth ?? 4;
  const minWidths = headers.map((_, i) => {
    const headerWidth = stripAnsi(headers[i] ?? "").length;
    const explicit = opts?.minWidths?.[i];
    const bounded = typeof explicit === "number" ? Math.max(1, Math.trunc(explicit)) : minBase;
    return Math.min(widths[i]!, Math.max(headerWidth, bounded));
  });

  const fittedWidths =
    typeof opts?.maxWidth === "number" && Number.isFinite(opts.maxWidth)
      ? shrinkWidthsToFit(widths, minWidths, Math.max(20, Math.trunc(opts.maxWidth)))
      : widths;

  const headerLine = headers
    .map((h, i) => padRight(h, fittedWidths[i]!))
    .join("  ");
  const separator = fittedWidths.map((w) => "-".repeat(w)).join("  ");

  const bodyLines: string[] = [];
  for (const row of rows) {
    const wrappedCells = headers.map((_, i) => wrapText(row[i] ?? "", fittedWidths[i]!));
    const rowHeight = wrappedCells.reduce((max, lines) => Math.max(max, lines.length), 1);

    for (let lineIdx = 0; lineIdx < rowHeight; lineIdx += 1) {
      const line = headers
        .map((_, i) => {
          const cellLine = wrappedCells[i]![lineIdx] ?? "";
          return padRight(cellLine, fittedWidths[i]!);
        })
        .join("  ");
      bodyLines.push(line);
    }
  }

  return [headerLine, separator, ...bodyLines];
}

export function getObject(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}
