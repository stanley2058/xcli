import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const WOEID_DATA_URL =
  "https://gist.githubusercontent.com/freakynit/57eb1a23adec8084f5fbbc452e42335d/raw/e326170bebcabebce40bd3fa2b282df04ce712a7/woeid_twitter_parsed.json";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type WoeidRecord = {
  placeName: string;
  country: string;
  woeid: number;
  placeType: string;
  countryCode?: string;
};

function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCachePath(): string {
  if (process.env["XCLI_WOEID_CACHE_PATH"]) return process.env["XCLI_WOEID_CACHE_PATH"];
  return join(homedir(), ".cache", "xcli", "woeid_twitter_parsed.json");
}

function parseWoeidRows(value: unknown): WoeidRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("WOEID index payload must be an array.");
  }

  const out: WoeidRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const row = item as Record<string, unknown>;
    const placeName = typeof row["place_name"] === "string" ? row["place_name"].trim() : "";
    const country = typeof row["country"] === "string" ? row["country"].trim() : "";
    const placeType = typeof row["type"] === "string" ? row["type"].trim() : "";
    const woeid =
      typeof row["woeid"] === "number"
        ? row["woeid"]
        : typeof row["woeid"] === "string"
          ? Number(row["woeid"])
          : NaN;
    const countryCode = typeof row["country_code"] === "string" ? row["country_code"] : undefined;

    if (!placeName || !Number.isFinite(woeid)) continue;

    out.push({
      placeName,
      country,
      placeType,
      woeid: Math.trunc(woeid),
      countryCode,
    });
  }

  if (out.length === 0) {
    throw new Error("WOEID index is empty.");
  }

  return out;
}

async function tryReadCache(allowStale: boolean): Promise<WoeidRecord[] | undefined> {
  const cachePath = getCachePath();

  try {
    const fileInfo = await stat(cachePath);
    if (!allowStale && Date.now() - fileInfo.mtimeMs > CACHE_MAX_AGE_MS) {
      return undefined;
    }

    const text = await readFile(cachePath, "utf8");
    return parseWoeidRows(JSON.parse(text));
  } catch {
    return undefined;
  }
}

async function writeCache(data: WoeidRecord[]): Promise<void> {
  const cachePath = getCachePath();
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data), "utf8");
}

async function fetchRemoteIndex(): Promise<WoeidRecord[]> {
  const res = await fetch(WOEID_DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch WOEID index: HTTP ${res.status} ${res.statusText}`.trim());
  }

  const payload = await res.json();
  return parseWoeidRows(payload);
}

export async function loadWoeidIndex(): Promise<WoeidRecord[]> {
  const freshCache = await tryReadCache(false);
  if (freshCache) return freshCache;

  try {
    const remote = await fetchRemoteIndex();
    await writeCache(remote);
    return remote;
  } catch {
    const staleCache = await tryReadCache(true);
    if (staleCache) return staleCache;
    throw new Error(
      "Unable to load WOEID index (network unavailable and no cache found)."
    );
  }
}

type Scored = WoeidRecord & { score: number };

function scoreRecord(record: WoeidRecord, queryNorm: string, queryTokens: string[]): number {
  const placeNorm = normalizeText(record.placeName);
  const countryNorm = normalizeText(record.country);
  const combined = `${placeNorm} ${countryNorm}`.trim();

  let score = 0;

  if (placeNorm === queryNorm) score += 200;
  if (combined === queryNorm) score += 240;

  if (placeNorm.startsWith(queryNorm)) score += 120;
  if (combined.startsWith(queryNorm)) score += 100;

  if (placeNorm.includes(queryNorm)) score += 80;
  if (combined.includes(queryNorm)) score += 60;

  for (const token of queryTokens) {
    if (placeNorm.includes(token)) score += 24;
    else if (countryNorm.includes(token)) score += 12;
  }

  return score;
}

export async function searchWoeid(
  query: string,
  opts?: { limit?: number }
): Promise<Scored[]> {
  const queryNorm = normalizeText(query);
  if (!queryNorm) return [];

  const limit = Math.max(1, Math.min(opts?.limit ?? 10, 100));
  const queryTokens = queryNorm.split(" ").filter((x) => x.length > 0);

  const index = await loadWoeidIndex();
  const scored: Scored[] = index
    .map((record) => ({ ...record, score: scoreRecord(record, queryNorm, queryTokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.placeName.localeCompare(b.placeName))
    .slice(0, limit);

  return scored;
}
