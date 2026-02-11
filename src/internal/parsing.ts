export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function stripAtPrefix(username: string): string {
  return username.startsWith("@") ? username.slice(1) : username;
}

export function getBearerToken(cliOverride?: string): string {
  const token =
    cliOverride ??
    process.env["X_API_BEARER_TOKEN"] ??
    process.env["BEARER_TOKEN"] ??
    "";

  if (!token) {
    throw new ConfigError(
      "Missing bearer token. Set X_API_BEARER_TOKEN (recommended) or pass --bearer-token."
    );
  }

  return token;
}

export function parseMaybeInt(v: string | boolean | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  if (v.trim().length === 0) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}
