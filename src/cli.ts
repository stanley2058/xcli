import { ApiError, Client, type ClientConfig } from "@xdevplatform/xdk";

import { parseArgv } from "./internal/argv.ts";
import {
  printFieldsHelp,
  printPostsHelp,
  printRootHelp,
  printTrendsHelp,
  printUsersHelp,
} from "./internal/help.ts";
import {
  printPostsHuman,
  printRawHuman,
  printTrendsHuman,
  printWoeidMatchesHuman,
  printUsersHuman,
} from "./internal/human.ts";
import {
  collectPostMedia,
  downloadPostMediaAssets,
  type MediaDownloadReport,
} from "./internal/media.ts";
import { ConfigError, getBearerToken, parseCsv, parseMaybeInt } from "./internal/parsing.ts";
import { searchWoeid } from "./internal/woeid.ts";
import {
  dedupe,
  isNumericId,
  jsonPrint,
  normalizeUsername,
  parsePostInput,
  parseUserInput,
  printError,
  printLine,
  style,
  toArray,
  getObject,
} from "./internal/util.ts";

type OutputMode = "human" | "json" | "json-pretty";

type GlobalOptions = {
  help: boolean;
  helpAll: boolean;
  outputMode: OutputMode;
  raw: boolean;
  bearerToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
};

type RequestFieldOptions = {
  userFields?: string[];
  tweetFields?: string[];
  expansions?: string[];
  mediaFields?: string[];
  pollFields?: string[];
  placeFields?: string[];
  trendFields?: string[];
};

type PostSearchMode = "recent" | "all";

const USER_SUBCOMMANDS = new Set(["by-id", "by-ids", "by-username", "by-usernames"]);
const POST_SUBCOMMANDS = new Set(["by-id", "by-ids"]);
const TREND_SUBCOMMANDS = new Set(["by-woeid"]);

function getGlobalOptions(argvOpts: Record<string, string | boolean>): GlobalOptions {
  const help = argvOpts["help"] === true || argvOpts["h"] === true;
  const helpAll = argvOpts["help-all"] === true;

  const json = argvOpts["json"] === true;
  const jsonPretty = argvOpts["json-pretty"] === true || argvOpts["pretty"] === true;

  const outputMode: OutputMode = jsonPretty ? "json-pretty" : json ? "json" : "human";
  const raw = argvOpts["raw"] === true;

  const bearerToken =
    typeof argvOpts["bearer-token"] === "string"
      ? argvOpts["bearer-token"]
      : undefined;

  const timeoutMs = parseMaybeInt(argvOpts["timeout"]);
  const maxRetries = parseMaybeInt(argvOpts["retries"]);

  return {
    help,
    helpAll,
    outputMode,
    raw,
    bearerToken,
    timeoutMs,
    maxRetries,
  };
}

function jsonPretty(mode: OutputMode): boolean {
  return mode === "json-pretty";
}

function getStringOpt(
  argvOpts: Record<string, string | boolean>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = argvOpts[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function getBooleanOpt(
  argvOpts: Record<string, string | boolean>,
  keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = argvOpts[key];
    if (value === true) return true;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
        return true;
      }
      if (
        normalized === "false" ||
        normalized === "0" ||
        normalized === "no" ||
        normalized === "off"
      ) {
        return false;
      }
    }
  }
  return undefined;
}

function parseBoundedInt(
  value: string | undefined,
  label: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = parseMaybeInt(value);
  if (parsed === undefined) {
    throw new ConfigError(`${label} must be an integer.`);
  }
  if (parsed < min || parsed > max) {
    throw new ConfigError(`${label} must be between ${min} and ${max}. Got: ${parsed}.`);
  }
  return parsed;
}

function parseSearchQuery(
  argvOpts: Record<string, string | boolean>,
  queryArgs: string[]
): string {
  const queryOpt = getStringOpt(argvOpts, ["query"]);

  if (queryOpt && queryArgs.length > 0) {
    throw new ConfigError("Provide query either as --query or as positional text, not both.");
  }

  const query = queryOpt ?? queryArgs.join(" ").trim();
  if (query.length === 0) {
    throw new ConfigError("Missing required search query.");
  }
  return query;
}

function createXClient(opts: GlobalOptions): Client {
  const bearerToken = getBearerToken(opts.bearerToken);

  const sdkTimeout =
    typeof opts.timeoutMs === "number" ? (opts.timeoutMs > 0 ? opts.timeoutMs : -1) : -1;

  const config: ClientConfig = {
    bearerToken,
    // XDK 0.4.0 uses `config.timeout || 30000`, so `0` falls back to 30000.
    // Use -1 to keep timeout disabled by default and avoid lingering 30s timers.
    timeout: sdkTimeout,
    retry: typeof opts.maxRetries === "number" ? opts.maxRetries > 0 : undefined,
    maxRetries: opts.maxRetries,
  };

  return new Client(config);
}

async function parseRawResponse(res: Response): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
}> {
  const headers = Object.fromEntries(res.headers.entries());
  const text = await res.text();

  if (text.length === 0) {
    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      body: null,
    };
  }

  try {
    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      body: JSON.parse(text),
    };
  } catch {
    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      body: text,
    };
  }
}

function printData(data: unknown, mode: OutputMode, topic: "users" | "posts" | "trends"): void {
  if (mode === "human") {
    if (topic === "users") printUsersHuman(data);
    else if (topic === "posts") printPostsHuman(data);
    else printTrendsHuman(data);
    return;
  }

  jsonPrint(data, { pretty: jsonPretty(mode) });
}

function printRawData(
  payload:
    | {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: unknown;
      }
    | {
        label: string;
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: unknown;
      }[],
  mode: OutputMode
): void {
  if (Array.isArray(payload)) {
    if (mode !== "human") {
      jsonPrint({ responses: payload }, { pretty: jsonPretty(mode) });
      return;
    }

    for (const item of payload) {
      printLine(style(item.label, "magenta"));
      printRawHuman(item);
      printLine("");
    }
    return;
  }

  if (mode === "human") {
    printRawHuman(payload);
    return;
  }

  jsonPrint(payload, { pretty: jsonPretty(mode) });
}

function printApiError(err: ApiError, mode: OutputMode): void {
  const payload = {
    error: {
      message: err.message,
      status: err.status,
      statusText: err.statusText,
      data: err.data,
      headers: Object.fromEntries(err.headers.entries()),
    },
  };

  if (mode !== "human") {
    jsonPrint(payload, { pretty: jsonPretty(mode) });
    return;
  }

  const title = `API error ${err.status} ${err.statusText}`.trim();
  printError(style(title, "red"));
  printError(err.message);

  if (err.status === 401 || err.status === 403) {
    printError(
      style(
        "Auth note: some endpoints may require user-context OAuth tokens for your account tier.",
        "yellow"
      )
    );
  }

  if (err.status === 429) {
    const reset = err.headers.get("x-rate-limit-reset");
    const remaining = err.headers.get("x-rate-limit-remaining");
    const limit = err.headers.get("x-rate-limit-limit");
    const bits: string[] = [];
    if (limit) bits.push(`limit=${limit}`);
    if (remaining) bits.push(`remaining=${remaining}`);
    if (reset) bits.push(`reset=${reset}`);
    if (bits.length > 0) printError(style(`Rate limit: ${bits.join(" ")}`, "yellow"));
  }

  const dataObj = getObject(err.data);
  const errors = toArray(dataObj?.["errors"]).map(getObject).filter((x): x is Record<string, unknown> => Boolean(x));
  if (errors.length > 0) {
    for (const e of errors) {
      const detail =
        typeof e["detail"] === "string"
          ? e["detail"]
          : typeof e["title"] === "string"
            ? e["title"]
            : JSON.stringify(e);
      printError(style(`- ${detail}`, "yellow"));
    }
  }
}

function getUsersLookupOptions(argvOpts: Record<string, string | boolean>): RequestFieldOptions {
  const preset = typeof argvOpts["preset"] === "string" ? argvOpts["preset"] : "minimal";

  const userFields =
    typeof argvOpts["user-fields"] === "string"
      ? parseCsv(argvOpts["user-fields"])
      : undefined;
  const expansions =
    typeof argvOpts["expansions"] === "string" ? parseCsv(argvOpts["expansions"]) : undefined;
  const tweetFields =
    typeof argvOpts["tweet-fields"] === "string"
      ? parseCsv(argvOpts["tweet-fields"])
      : undefined;

  const presetDefaults: RequestFieldOptions =
    preset === "profile"
      ? {
          userFields: [
            "created_at",
            "description",
            "location",
            "profile_image_url",
            "protected",
            "public_metrics",
            "url",
            "verified",
            "verified_type",
            "pinned_tweet_id",
          ],
        }
      : {
          userFields: ["public_metrics", "verified", "verified_type"],
        };

  return {
    userFields: userFields ?? presetDefaults.userFields,
    expansions,
    tweetFields,
  };
}

function getPostsLookupOptions(argvOpts: Record<string, string | boolean>): RequestFieldOptions {
  const preset = typeof argvOpts["preset"] === "string" ? argvOpts["preset"] : "post";

  const tweetFields =
    typeof argvOpts["tweet-fields"] === "string"
      ? parseCsv(argvOpts["tweet-fields"])
      : undefined;
  const expansions =
    typeof argvOpts["expansions"] === "string" ? parseCsv(argvOpts["expansions"]) : undefined;
  const userFields =
    typeof argvOpts["user-fields"] === "string" ? parseCsv(argvOpts["user-fields"]) : undefined;
  const mediaFields =
    typeof argvOpts["media-fields"] === "string"
      ? parseCsv(argvOpts["media-fields"])
      : undefined;
  const pollFields =
    typeof argvOpts["poll-fields"] === "string" ? parseCsv(argvOpts["poll-fields"]) : undefined;
  const placeFields =
    typeof argvOpts["place-fields"] === "string"
      ? parseCsv(argvOpts["place-fields"])
      : undefined;

  const presetDefaults: RequestFieldOptions =
    preset === "post"
      ? {
          tweetFields: [
            "created_at",
            "public_metrics",
            "author_id",
            "conversation_id",
            "attachments",
          ],
          expansions: ["author_id", "attachments.media_keys"],
          userFields: ["username", "name", "verified"],
          mediaFields: [
            "media_key",
            "type",
            "url",
            "preview_image_url",
            "duration_ms",
            "alt_text",
          ],
        }
      : {};

  return {
    tweetFields: tweetFields ?? presetDefaults.tweetFields,
    expansions: expansions ?? presetDefaults.expansions,
    userFields: userFields ?? presetDefaults.userFields,
    mediaFields: mediaFields ?? presetDefaults.mediaFields,
    pollFields,
    placeFields,
  };
}

function getUsersSearchOptions(argvOpts: Record<string, string | boolean>): {
  maxResults?: number;
  nextToken?: string;
  userFields?: string[];
  expansions?: string[];
  tweetFields?: string[];
} {
  const fields = getUsersLookupOptions(argvOpts);

  const maxResults = parseBoundedInt(
    getStringOpt(argvOpts, ["max-results", "max_results"]),
    "--max-results",
    1,
    1000
  );

  const nextToken = getStringOpt(argvOpts, ["next-token", "next_token"]);

  return {
    maxResults,
    nextToken,
    userFields: fields.userFields,
    expansions: fields.expansions,
    tweetFields: fields.tweetFields,
  };
}

function getPostsSearchOptions(
  argvOpts: Record<string, string | boolean>,
  mode: PostSearchMode
): {
  startTime?: string;
  endTime?: string;
  sinceId?: string;
  untilId?: string;
  maxResults?: number;
  nextToken?: string;
  paginationToken?: string;
  sortOrder?: "recency" | "relevancy";
  tweetFields?: string[];
  expansions?: string[];
  userFields?: string[];
  mediaFields?: string[];
  pollFields?: string[];
  placeFields?: string[];
} {
  const fields = getPostsLookupOptions(argvOpts);

  const maxResults = parseBoundedInt(
    getStringOpt(argvOpts, ["max-results", "max_results"]),
    "--max-results",
    10,
    mode === "recent" ? 100 : 500
  );

  const nextToken = getStringOpt(argvOpts, ["next-token", "next_token"]);
  const paginationToken = getStringOpt(argvOpts, ["pagination-token", "pagination_token"]);

  if (nextToken && paginationToken) {
    throw new ConfigError("Use either --next-token or --pagination-token, not both.");
  }

  const sinceId = getStringOpt(argvOpts, ["since-id", "since_id"]);
  if (sinceId && !isNumericId(sinceId)) {
    throw new ConfigError("--since-id must be a numeric post ID.");
  }

  const untilId = getStringOpt(argvOpts, ["until-id", "until_id"]);
  if (untilId && !isNumericId(untilId)) {
    throw new ConfigError("--until-id must be a numeric post ID.");
  }

  const sortOrderRaw = getStringOpt(argvOpts, ["sort-order", "sort_order"]);
  const sortOrder =
    sortOrderRaw === undefined
      ? undefined
      : sortOrderRaw === "recency" || sortOrderRaw === "relevancy"
        ? sortOrderRaw
        : undefined;
  if (sortOrderRaw !== undefined && sortOrder === undefined) {
    throw new ConfigError("--sort-order must be one of: recency, relevancy.");
  }

  return {
    startTime: getStringOpt(argvOpts, ["start-time", "start_time"]),
    endTime: getStringOpt(argvOpts, ["end-time", "end_time"]),
    sinceId,
    untilId,
    maxResults,
    nextToken,
    paginationToken,
    sortOrder,
    tweetFields: fields.tweetFields,
    expansions: fields.expansions,
    userFields: fields.userFields,
    mediaFields: fields.mediaFields,
    pollFields: fields.pollFields,
    placeFields: fields.placeFields,
  };
}

function getPostsMediaDownloadOptions(argvOpts: Record<string, string | boolean>): {
  downloadMedia: boolean;
  mediaDir: string;
} {
  const downloadMedia =
    getBooleanOpt(argvOpts, ["download-media", "download_media"]) ?? false;
  const mediaDir = getStringOpt(argvOpts, ["media-dir", "media_dir"]) ?? "./xcli-media";
  return {
    downloadMedia,
    mediaDir,
  };
}

function getTrendsOptions(argvOpts: Record<string, string | boolean>): {
  maxTrends?: number;
  trendFields?: string[];
} {
  const maxTrends = parseBoundedInt(
    getStringOpt(argvOpts, ["max-trends", "max_trends"]),
    "--max-trends",
    1,
    50
  );

  const trendFields =
    typeof argvOpts["trend-fields"] === "string"
      ? parseCsv(argvOpts["trend-fields"])
      : typeof argvOpts["trend.fields"] === "string"
        ? parseCsv(argvOpts["trend.fields"])
        : undefined;

  return {
    maxTrends,
    trendFields,
  };
}

function mergeLookupResponses(responses: unknown[]): unknown {
  if (responses.length === 1) return responses[0];

  const data: unknown[] = [];
  const seenIds = new Set<string>();
  const errors: unknown[] = [];
  const includes: Record<string, unknown[]> = {};

  for (const response of responses) {
    const obj = getObject(response);
    if (!obj) continue;

    for (const item of toArray(obj["data"])) {
      const id = getObject(item)?.["id"];
      if (typeof id === "string") {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      data.push(item);
    }
    errors.push(...toArray(obj["errors"]));

    const inc = getObject(obj["includes"]);
    if (!inc) continue;

    for (const [key, value] of Object.entries(inc)) {
      includes[key] ??= [];
      includes[key]!.push(...toArray(value));
    }
  }

  const out: Record<string, unknown> = { data };
  if (Object.keys(includes).length > 0) out["includes"] = includes;
  if (errors.length > 0) out["errors"] = errors;
  out["meta"] = { response_count: responses.length, merged: true };
  return out;
}

function requireAtMost100(values: string[], label: string): void {
  if (values.length > 100) {
    throw new ConfigError(`${label} accepts at most 100 values per request. Got: ${values.length}.`);
  }
}

function printMediaDownloadReport(report: MediaDownloadReport, mode: OutputMode): void {
  const line = `Media download: downloaded ${report.downloaded}/${report.attempted} file(s) to ${report.outputDir}`;

  if (mode === "human") {
    if (report.downloaded > 0) {
      printLine(style(line, "green"));
    } else {
      printLine(style(line, "yellow"));
    }
  } else {
    printError(line);
  }

  if (report.errors.length > 0) {
    const sample = report.errors.slice(0, 3);
    for (const err of sample) {
      if (mode === "human") printLine(style(`- ${err}`, "yellow"));
      else printError(`- ${err}`);
    }
    if (report.errors.length > sample.length) {
      const rem = report.errors.length - sample.length;
      if (mode === "human") printLine(style(`... and ${rem} more download error(s).`, "yellow"));
      else printError(`... and ${rem} more download error(s).`);
    }
  }
}

async function maybeDownloadPostMedia(
  response: unknown,
  argvOpts: Record<string, string | boolean>,
  g: GlobalOptions
): Promise<void> {
  const downloadOpts = getPostsMediaDownloadOptions(argvOpts);
  if (!downloadOpts.downloadMedia) return;

  const { downloadable } = collectPostMedia(response);
  if (downloadable.length === 0) {
    const hint =
      "No downloadable attachment media URLs found. Include --expansions attachments.media_keys and --media-fields media_key,type,url,preview_image_url.";
    if (g.outputMode === "human") {
      printLine(style(hint, "yellow"));
    } else {
      printError(hint);
    }
    return;
  }

  const report = await downloadPostMediaAssets(downloadable, downloadOpts.mediaDir);
  printMediaDownloadReport(report, g.outputMode);
}

async function runWoeidSearch(
  args: string[],
  argvOpts: Record<string, string | boolean>,
  g: GlobalOptions
): Promise<number> {
  const query = parseSearchQuery(argvOpts, args);
  const limit = parseBoundedInt(getStringOpt(argvOpts, ["limit"]), "--limit", 1, 100) ?? 10;
  const matches = await searchWoeid(query, { limit });

  if (g.outputMode === "human") {
    printWoeidMatchesHuman(query, matches);
    if (matches.length > 0) {
      const best = matches[0]!;
      printLine("");
      printLine(style(`Try: xcli trends ${best.woeid}`, "dim"));
    }
    return matches.length > 0 ? 0 : 1;
  }

  jsonPrint(
    {
      query,
      count: matches.length,
      matches,
    },
    { pretty: jsonPretty(g.outputMode) }
  );
  return matches.length > 0 ? 0 : 1;
}

async function resolveWoeidFromQuery(
  query: string
): Promise<{ resolved: number; displayName: string; hadMultiple: boolean }> {
  const matches = await searchWoeid(query, { limit: 5 });
  if (matches.length === 0) {
    throw new ConfigError(`No WOEID match found for '${query}'. Try: xcli trends search ${query}`);
  }

  const best = matches[0]!;
  const label = best.country ? `${best.placeName}, ${best.country}` : best.placeName;
  return {
    resolved: best.woeid,
    displayName: label,
    hadMultiple: matches.length > 1,
  };
}

async function runUsersSearch(
  clientFactory: () => Client,
  queryArgs: string[],
  argvOpts: Record<string, string | boolean>,
  g: GlobalOptions
): Promise<number> {
  const query = parseSearchQuery(argvOpts, queryArgs);
  const options = getUsersSearchOptions(argvOpts);
  const client = clientFactory();

  if (g.raw) {
    const res = await client.users.search(query, {
      ...options,
      requestOptions: { raw: true },
    });
    printRawData(await parseRawResponse(res), g.outputMode);
    return 0;
  }

  const data = await client.users.search(query, options);
  printData(data, g.outputMode, "users");
  return 0;
}

async function runPostsSearch(
  clientFactory: () => Client,
  args: string[],
  argvOpts: Record<string, string | boolean>,
  g: GlobalOptions
): Promise<number> {
  const candidate = args[0];
  const mode: PostSearchMode = candidate === "all" ? "all" : "recent";
  const queryArgs = candidate === "recent" || candidate === "all" ? args.slice(1) : args;

  const query = parseSearchQuery(argvOpts, queryArgs);
  const options = getPostsSearchOptions(argvOpts, mode);
  const client = clientFactory();

  if (g.raw) {
    const res =
      mode === "all"
        ? await client.posts.searchAll(query, {
            ...options,
            requestOptions: { raw: true },
          })
        : await client.posts.searchRecent(query, {
            ...options,
            requestOptions: { raw: true },
          });

    printRawData(await parseRawResponse(res), g.outputMode);
    return 0;
  }

  const data =
    mode === "all"
      ? await client.posts.searchAll(query, options)
      : await client.posts.searchRecent(query, options);
  printData(data, g.outputMode, "posts");
  await maybeDownloadPostMedia(data, argvOpts, g);
  return 0;
}

async function runUsersCommand(
  clientFactory: () => Client,
  args: string[],
  argvOpts: Record<string, string | boolean>,
  g: GlobalOptions
): Promise<number> {
  if (g.help || args[0] === undefined) {
    printUsersHelp({ all: g.helpAll });
    return 0;
  }

  const fields = getUsersLookupOptions(argvOpts);

  try {
    const first = args[0]!;

    if (first === "search") {
      return await runUsersSearch(clientFactory, args.slice(1), argvOpts, g);
    }

    const explicit = USER_SUBCOMMANDS.has(first);

    if (explicit) {
      const sub = first;
      const subArgs = args.slice(1);

      if (sub === "by-id") {
        const id = subArgs[0];
        if (!id) {
          printError("Missing required <id>.");
          return 1;
        }

        const client = clientFactory();

        if (g.raw) {
          const res = await client.users.getById(id, {
            ...fields,
            requestOptions: { raw: true },
          });
          printRawData(await parseRawResponse(res), g.outputMode);
          return 0;
        }

        const data = await client.users.getById(id, fields);
        printData(data, g.outputMode, "users");
        return 0;
      }

      if (sub === "by-username") {
        const username = subArgs[0];
        if (!username) {
          printError("Missing required <username>. You can pass with or without '@'.");
          return 1;
        }

        const client = clientFactory();

        if (g.raw) {
          const res = await client.users.getByUsername(normalizeUsername(username), {
            ...fields,
            requestOptions: { raw: true },
          });
          printRawData(await parseRawResponse(res), g.outputMode);
          return 0;
        }

        const data = await client.users.getByUsername(normalizeUsername(username), fields);
        printData(data, g.outputMode, "users");
        return 0;
      }

      if (sub === "by-ids") {
        const ids = dedupe(subArgs);
        if (ids.length === 0) {
          printError("Missing required <id...>.");
          return 1;
        }

        requireAtMost100(ids, "users by-ids");

        const client = clientFactory();

        if (g.raw) {
          const res = await client.users.getByIds(ids, {
            ...fields,
            requestOptions: { raw: true },
          });
          printRawData(await parseRawResponse(res), g.outputMode);
          return 0;
        }

        const data = await client.users.getByIds(ids, fields);
        printData(data, g.outputMode, "users");
        return 0;
      }

      if (sub === "by-usernames") {
        const usernames = dedupe(subArgs.map(normalizeUsername));
        if (usernames.length === 0) {
          printError("Missing required <username...>.");
          return 1;
        }

        requireAtMost100(usernames, "users by-usernames");

        const client = clientFactory();

        if (g.raw) {
          const res = await client.users.getByUsernames(usernames, {
            ...fields,
            requestOptions: { raw: true },
          });
          printRawData(await parseRawResponse(res), g.outputMode);
          return 0;
        }

        const data = await client.users.getByUsernames(usernames, fields);
        printData(data, g.outputMode, "users");
        return 0;
      }
    }

    // Inferred mode: xcli users <id|ids|username|usernames|url|urls>
    const parsed = args.map(parseUserInput);
    const invalid = parsed.filter((x) => x.kind === "invalid");

    if (invalid.length > 0) {
      for (const bad of invalid) {
        printError(`Invalid input '${bad.source}': ${bad.reason}`);
      }
      return 1;
    }

    const ids = dedupe(
      parsed
        .filter((x): x is Extract<typeof x, { kind: "id" }> => x.kind === "id")
        .map((x) => x.value)
    );
    const usernames = dedupe(
      parsed
        .filter((x): x is Extract<typeof x, { kind: "username" }> => x.kind === "username")
        .map((x) => x.value)
    );

    if (ids.length === 0 && usernames.length === 0) {
      printError("No valid user inputs found.");
      return 1;
    }

    requireAtMost100(ids, "users IDs");
    requireAtMost100(usernames, "users usernames");

    const client = clientFactory();

    if (g.raw) {
      const responses: Array<{
        label: string;
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: unknown;
      }> = [];

      if (ids.length > 0) {
        const res = await client.users.getByIds(ids, {
          ...fields,
          requestOptions: { raw: true },
        });
        responses.push({ label: `users.getByIds (${ids.length})`, ...(await parseRawResponse(res)) });
      }

      if (usernames.length > 0) {
        const res = await client.users.getByUsernames(usernames, {
          ...fields,
          requestOptions: { raw: true },
        });
        responses.push({ label: `users.getByUsernames (${usernames.length})`, ...(await parseRawResponse(res)) });
      }

      if (responses.length === 1) {
        const single = responses[0]!;
        const { label: _label, ...payload } = single;
        printRawData(payload, g.outputMode);
      } else {
        printRawData(responses, g.outputMode);
      }
      return 0;
    }

    const responses: unknown[] = [];
    if (ids.length > 0) {
      responses.push(await client.users.getByIds(ids, fields));
    }
    if (usernames.length > 0) {
      responses.push(await client.users.getByUsernames(usernames, fields));
    }

    printData(mergeLookupResponses(responses), g.outputMode, "users");
    return 0;
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      printError(err.message);
      return 1;
    }
    if (err instanceof ApiError) {
      printApiError(err, g.outputMode);
      return 2;
    }

    printError(err instanceof Error ? err.message : String(err));
    return 2;
  }
}

async function runPostsCommand(
  clientFactory: () => Client,
  args: string[],
  argvOpts: Record<string, string | boolean>,
  g: GlobalOptions
): Promise<number> {
  if (g.help || args[0] === undefined) {
    printPostsHelp({ all: g.helpAll });
    return 0;
  }

  const fields = getPostsLookupOptions(argvOpts);

  try {
    const first = args[0]!;

    if (first === "search") {
      return await runPostsSearch(clientFactory, args.slice(1), argvOpts, g);
    }

    const explicit = POST_SUBCOMMANDS.has(first);

    if (explicit) {
      const sub = first;
      const subArgs = args.slice(1);

      if (sub === "by-id") {
        const input = subArgs[0];
        if (!input) {
          printError("Missing required <id|url>.");
          return 1;
        }

        const parsed = parsePostInput(input);
        if (parsed.kind === "invalid") {
          printError(`Invalid input '${parsed.source}': ${parsed.reason}`);
          return 1;
        }

        const client = clientFactory();

        if (g.raw) {
          const res = await client.posts.getById(parsed.value, {
            ...fields,
            requestOptions: { raw: true },
          });
          printRawData(await parseRawResponse(res), g.outputMode);
          return 0;
        }

        const data = await client.posts.getById(parsed.value, fields);
        printData(data, g.outputMode, "posts");
        await maybeDownloadPostMedia(data, argvOpts, g);
        return 0;
      }

      if (sub === "by-ids") {
        const parsed = subArgs.map(parsePostInput);
        const invalid = parsed.filter((x) => x.kind === "invalid");
        if (invalid.length > 0) {
          for (const bad of invalid) {
            printError(`Invalid input '${bad.source}': ${bad.reason}`);
          }
          return 1;
        }

        const ids = dedupe(
          parsed
            .filter((x): x is Extract<typeof x, { kind: "id" }> => x.kind === "id")
            .map((x) => x.value)
        );

        if (ids.length === 0) {
          printError("Missing required <id...>.");
          return 1;
        }

        requireAtMost100(ids, "posts by-ids");

        const client = clientFactory();

        if (g.raw) {
          const res = await client.posts.getByIds(ids, {
            ...fields,
            requestOptions: { raw: true },
          });
          printRawData(await parseRawResponse(res), g.outputMode);
          return 0;
        }

        const data = await client.posts.getByIds(ids, fields);
        printData(data, g.outputMode, "posts");
        await maybeDownloadPostMedia(data, argvOpts, g);
        return 0;
      }
    }

    // Inferred mode: xcli posts <id|ids|url|urls>
    const parsed = args.map(parsePostInput);
    const invalid = parsed.filter((x) => x.kind === "invalid");
    if (invalid.length > 0) {
      for (const bad of invalid) {
        printError(`Invalid input '${bad.source}': ${bad.reason}`);
      }
      return 1;
    }

    const ids = dedupe(
      parsed
        .filter((x): x is Extract<typeof x, { kind: "id" }> => x.kind === "id")
        .map((x) => x.value)
    );

    if (ids.length === 0) {
      printError("No valid post inputs found.");
      return 1;
    }

    requireAtMost100(ids, "posts IDs");

    const client = clientFactory();

    if (g.raw) {
      const res = await client.posts.getByIds(ids, {
        ...fields,
        requestOptions: { raw: true },
      });
      printRawData(await parseRawResponse(res), g.outputMode);
      return 0;
    }

    const data = await client.posts.getByIds(ids, fields);
    printData(data, g.outputMode, "posts");
    await maybeDownloadPostMedia(data, argvOpts, g);
    return 0;
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      printError(err.message);
      return 1;
    }
    if (err instanceof ApiError) {
      printApiError(err, g.outputMode);
      return 2;
    }

    printError(err instanceof Error ? err.message : String(err));
    return 2;
  }
}

async function runTrendsCommand(
  clientFactory: () => Client,
  args: string[],
  argvOpts: Record<string, string | boolean>,
  g: GlobalOptions
): Promise<number> {
  if (g.help || args[0] === undefined) {
    printTrendsHelp({ all: g.helpAll });
    return 0;
  }

  try {
    const first = args[0]!;

    if (first === "search") {
      return await runWoeidSearch(args.slice(1), argvOpts, g);
    }

    const woeidRaw = TREND_SUBCOMMANDS.has(first) ? args[1] : first;
    if (!woeidRaw) {
      printError("Missing required <woeid|location>.");
      return 1;
    }

    let woeid: number;
    if (isNumericId(woeidRaw)) {
      woeid = Number(woeidRaw);
      if (!Number.isInteger(woeid) || woeid <= 0 || woeid > 2147483647) {
        throw new ConfigError("<woeid> must be an integer in the range 1..2147483647.");
      }
    } else {
      const query = parseSearchQuery(
        argvOpts,
        TREND_SUBCOMMANDS.has(first) ? args.slice(1) : args
      );
      const resolved = await resolveWoeidFromQuery(query);
      woeid = resolved.resolved;

      if (g.outputMode === "human") {
        printLine(style(`Resolved '${query}' -> ${woeid} (${resolved.displayName})`, "dim"));
        if (resolved.hadMultiple) {
          printLine(style(`Tip: use 'xcli trends search ${query}' to inspect alternatives.`, "dim"));
        }
        printLine("");
      }
    }

    const options = getTrendsOptions(argvOpts);
    const client = clientFactory();

    if (g.raw) {
      const res = await client.trends.getByWoeid(woeid, {
        ...options,
        requestOptions: { raw: true },
      });
      printRawData(await parseRawResponse(res), g.outputMode);
      return 0;
    }

    const data = await client.trends.getByWoeid(woeid, options);
    printData(data, g.outputMode, "trends");
    return 0;
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      printError(err.message);
      return 1;
    }
    if (err instanceof ApiError) {
      printApiError(err, g.outputMode);
      return 2;
    }

    printError(err instanceof Error ? err.message : String(err));
    return 2;
  }
}

async function runFieldsCommand(args: string[], g: GlobalOptions): Promise<number> {
  if (g.help || args[0] === undefined) {
    printFieldsHelp({ all: g.helpAll });
    return 0;
  }

  const topic = typeof args[0] === "string" ? args[0].toLowerCase() : args[0];
  printFieldsHelp({ all: true, topic });
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const { positionals, opts } = parseArgv(argv);
  const g = getGlobalOptions(opts);

  const cmd = positionals[0];
  const cmdArgs = positionals.slice(1);

  if (cmd === undefined) {
    printRootHelp({ all: g.helpAll });
    return 0;
  }

  // Help mode: avoid requiring tokens or making network calls.
  if (g.help || g.helpAll) {
    if (cmd === "users") {
      printUsersHelp({ all: g.helpAll });
      return 0;
    }
    if (cmd === "posts") {
      printPostsHelp({ all: g.helpAll });
      return 0;
    }
    if (cmd === "trends") {
      printTrendsHelp({ all: g.helpAll });
      return 0;
    }
    if (cmd === "fields") {
      printFieldsHelp({ all: g.helpAll });
      return 0;
    }

    printRootHelp({ all: g.helpAll });
    return 0;
  }

  if (cmd === "fields") {
    return runFieldsCommand(cmdArgs, g);
  }

  if (cmd === "trends") {
    if (cmdArgs.length === 0) {
      printTrendsHelp({ all: false });
      return 0;
    }
    const clientFactory = (): Client => createXClient(g);
    return runTrendsCommand(clientFactory, cmdArgs, opts, g);
  }

  if (cmd === "users" || cmd === "posts") {
    if (cmdArgs.length === 0) {
      if (cmd === "users") printUsersHelp({ all: false });
      else printPostsHelp({ all: false });
      return 0;
    }

    const clientFactory = (): Client => createXClient(g);
    if (cmd === "users") return runUsersCommand(clientFactory, cmdArgs, opts, g);
    return runPostsCommand(clientFactory, cmdArgs, opts, g);
  }

  printError(`Unknown command: ${cmd}`);
  printRootHelp({ all: false });
  return 1;
}

if (import.meta.main) {
  const exitCode = await main(process.argv.slice(2));
  process.exitCode = exitCode;
}
