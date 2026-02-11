import { ApiError, Client, type ClientConfig } from "@xdevplatform/xdk";

import { parseArgv } from "./internal/argv.ts";
import {
  printFieldsHelp,
  printPostsHelp,
  printRootHelp,
  printUsersHelp,
} from "./internal/help.ts";
import { printPostsHuman, printRawHuman, printUsersHuman } from "./internal/human.ts";
import { ConfigError, getBearerToken, parseCsv, parseMaybeInt } from "./internal/parsing.ts";
import {
  dedupe,
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
};

const USER_SUBCOMMANDS = new Set(["by-id", "by-ids", "by-username", "by-usernames"]);
const POST_SUBCOMMANDS = new Set(["by-id", "by-ids"]);

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

function printData(data: unknown, mode: OutputMode, topic: "users" | "posts"): void {
  if (mode === "human") {
    if (topic === "users") printUsersHuman(data);
    else printPostsHuman(data);
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

  const presetDefaults =
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
            "pinned_tweet_id",
          ],
        }
      : {};

  return {
    userFields: userFields ?? (presetDefaults as { userFields?: string[] }).userFields,
    expansions,
    tweetFields,
  };
}

function getPostsLookupOptions(argvOpts: Record<string, string | boolean>): RequestFieldOptions {
  const preset = typeof argvOpts["preset"] === "string" ? argvOpts["preset"] : "minimal";

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

  const presetDefaults =
    preset === "post"
      ? {
          tweetFields: ["created_at", "public_metrics", "author_id", "conversation_id"],
          expansions: ["author_id"],
          userFields: ["username", "name", "verified"],
        }
      : {};

  return {
    tweetFields: tweetFields ?? (presetDefaults as { tweetFields?: string[] }).tweetFields,
    expansions: expansions ?? (presetDefaults as { expansions?: string[] }).expansions,
    userFields: userFields ?? (presetDefaults as { userFields?: string[] }).userFields,
    mediaFields,
    pollFields,
    placeFields,
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
          } as any);
          printRawData(await parseRawResponse(res as unknown as Response), g.outputMode);
          return 0;
        }

        const data = await client.users.getById(id, fields as any);
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
          } as any);
          printRawData(await parseRawResponse(res as unknown as Response), g.outputMode);
          return 0;
        }

        const data = await client.users.getByUsername(normalizeUsername(username), fields as any);
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
          } as any);
          printRawData(await parseRawResponse(res as unknown as Response), g.outputMode);
          return 0;
        }

        const data = await client.users.getByIds(ids, fields as any);
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
          } as any);
          printRawData(await parseRawResponse(res as unknown as Response), g.outputMode);
          return 0;
        }

        const data = await client.users.getByUsernames(usernames, fields as any);
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
        } as any);
        responses.push({ label: `users.getByIds (${ids.length})`, ...(await parseRawResponse(res as unknown as Response)) });
      }

      if (usernames.length > 0) {
        const res = await client.users.getByUsernames(usernames, {
          ...fields,
          requestOptions: { raw: true },
        } as any);
        responses.push({ label: `users.getByUsernames (${usernames.length})`, ...(await parseRawResponse(res as unknown as Response)) });
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
      responses.push(await client.users.getByIds(ids, fields as any));
    }
    if (usernames.length > 0) {
      responses.push(await client.users.getByUsernames(usernames, fields as any));
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
          } as any);
          printRawData(await parseRawResponse(res as unknown as Response), g.outputMode);
          return 0;
        }

        const data = await client.posts.getById(parsed.value, fields as any);
        printData(data, g.outputMode, "posts");
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
          } as any);
          printRawData(await parseRawResponse(res as unknown as Response), g.outputMode);
          return 0;
        }

        const data = await client.posts.getByIds(ids, fields as any);
        printData(data, g.outputMode, "posts");
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
      } as any);
      printRawData(await parseRawResponse(res as unknown as Response), g.outputMode);
      return 0;
    }

    const data = await client.posts.getByIds(ids, fields as any);
    printData(data, g.outputMode, "posts");
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

  const topic = args[0];
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
