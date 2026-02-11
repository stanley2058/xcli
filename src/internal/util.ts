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
