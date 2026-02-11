import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type XcliConfigFile = {
  bearerToken?: string;
};

const CONFIG_PATH = join(homedir(), ".config", "xcli", "config.json");

let cachedConfig: XcliConfigFile | undefined;

function readConfigFile(): XcliConfigFile {
  if (cachedConfig !== undefined) return cachedConfig;

  if (!existsSync(CONFIG_PATH)) {
    cachedConfig = {};
    return cachedConfig;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Invalid JSON in ${CONFIG_PATH}: ${msg}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError(`Invalid config at ${CONFIG_PATH}: expected a JSON object.`);
  }

  const obj = parsed as Record<string, unknown>;
  const rawBearerToken = obj["bearerToken"];
  if (rawBearerToken !== undefined && typeof rawBearerToken !== "string") {
    throw new ConfigError(`Invalid config at ${CONFIG_PATH}: bearerToken must be a string.`);
  }

  const bearerToken =
    typeof rawBearerToken === "string" && rawBearerToken.trim().length > 0
      ? rawBearerToken.trim()
      : undefined;

  cachedConfig = { bearerToken };
  return cachedConfig;
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
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
  const config = readConfigFile();
  const token = firstNonEmpty([
    cliOverride,
    process.env["X_API_BEARER_TOKEN"],
    process.env["BEARER_TOKEN"],
    config.bearerToken,
  ]);

  if (!token) {
    throw new ConfigError(
      `Missing bearer token. Set X_API_BEARER_TOKEN (recommended), set BEARER_TOKEN, add bearerToken to ${CONFIG_PATH}, or pass --bearer-token.`
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
