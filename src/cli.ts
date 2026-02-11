import { ApiError, Client, type ClientConfig } from "@xdevplatform/xdk";

import { parseArgv } from "./internal/argv.ts";
import {
  printFieldsHelp,
  printPostsHelp,
  printRootHelp,
  printUsersHelp,
} from "./internal/help.ts";
import {
  ConfigError,
  getBearerToken,
  parseCsv,
  parseMaybeInt,
  stripAtPrefix,
} from "./internal/parsing.ts";
import {
  extractPostId,
  isProbablyUrl,
  jsonPrint,
  printError,
} from "./internal/util.ts";

type GlobalOptions = {
  help: boolean;
  helpAll: boolean;
  pretty: boolean;
  raw: boolean;
  bearerToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
};

function getGlobalOptions(argvOpts: Record<string, string | boolean>): GlobalOptions {
  const help = argvOpts["help"] === true || argvOpts["h"] === true;
  const helpAll = argvOpts["help-all"] === true;
  const pretty = argvOpts["pretty"] === true;
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
    pretty,
    raw,
    bearerToken,
    timeoutMs,
    maxRetries,
  };
}

function createXClient(opts: GlobalOptions): Client {
  const bearerToken = getBearerToken(opts.bearerToken);

  const config: ClientConfig = {
    bearerToken,
    timeout: opts.timeoutMs,
    retry: typeof opts.maxRetries === "number" ? opts.maxRetries > 0 : undefined,
    maxRetries: opts.maxRetries,
  };

  return new Client(config);
}

async function printRawResponse(res: Response, pretty: boolean): Promise<void> {
  const headers = Object.fromEntries(res.headers.entries());
  const text = await res.text();
  let body: unknown = text;

  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // keep as text
    }
  }

  jsonPrint(
    {
      status: res.status,
      statusText: res.statusText,
      headers,
      body,
    },
    { pretty }
  );
}

async function runUsersCommand(
  clientFactory: () => Client,
  args: string[],
  argvOpts: Record<string, string | boolean>,
  g: GlobalOptions
): Promise<number> {
  const sub = args[0];
  const subArgs = args.slice(1);

  if (g.help || sub === undefined || sub === "--help") {
    printUsersHelp({ all: g.helpAll });
    return 0;
  }

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

  const presetDefaults = preset === "profile" ? {
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
  } : {};

  const finalUserFields = userFields ?? (presetDefaults as any).userFields;
  const finalExpansions = expansions;
  const finalTweetFields = tweetFields;

  try {
    if (sub === "by-id") {
      const id = subArgs[0];
      if (!id) {
        printError("Missing required <id>.");
        return 1;
      }

      const client = clientFactory();

      if (g.raw) {
        const res = await client.users.getById(id, {
          userFields: finalUserFields,
          expansions: finalExpansions,
          tweetFields: finalTweetFields,
          requestOptions: { raw: true },
        } as any);
        await printRawResponse(res as unknown as Response, g.pretty);
        return 0;
      }

      const data = await client.users.getById(id, {
        userFields: finalUserFields,
        expansions: finalExpansions,
        tweetFields: finalTweetFields,
      } as any);
      jsonPrint(data, { pretty: g.pretty });
      return 0;
    }

    if (sub === "by-username") {
      const rawUsername = subArgs[0];
      if (!rawUsername) {
        printError("Missing required <username>. You can pass with or without '@'.");
        return 1;
      }

      const username = stripAtPrefix(rawUsername);

      const client = clientFactory();

      if (g.raw) {
        const res = await client.users.getByUsername(username, {
          userFields: finalUserFields,
          expansions: finalExpansions,
          tweetFields: finalTweetFields,
          requestOptions: { raw: true },
        } as any);
        await printRawResponse(res as unknown as Response, g.pretty);
        return 0;
      }

      const data = await client.users.getByUsername(username, {
        userFields: finalUserFields,
        expansions: finalExpansions,
        tweetFields: finalTweetFields,
      } as any);
      jsonPrint(data, { pretty: g.pretty });
      return 0;
    }

    if (sub === "by-ids") {
      const ids = subArgs;
      if (ids.length === 0) {
        printError("Missing required <id...> (one or more IDs).\nTip: up to 100 IDs per request.");
        return 1;
      }

      const client = clientFactory();

      if (g.raw) {
        const res = await client.users.getByIds(ids, {
          userFields: finalUserFields,
          expansions: finalExpansions,
          tweetFields: finalTweetFields,
          requestOptions: { raw: true },
        } as any);
        await printRawResponse(res as unknown as Response, g.pretty);
        return 0;
      }

      const data = await client.users.getByIds(ids, {
        userFields: finalUserFields,
        expansions: finalExpansions,
        tweetFields: finalTweetFields,
      } as any);
      jsonPrint(data, { pretty: g.pretty });
      return 0;
    }

    if (sub === "by-usernames") {
      const rawUsernames = subArgs;
      if (rawUsernames.length === 0) {
        printError(
          "Missing required <username...> (one or more usernames). You can pass with or without '@'.\nTip: up to 100 usernames per request."
        );
        return 1;
      }

      const usernames = rawUsernames.map(stripAtPrefix);

      const client = clientFactory();

      if (g.raw) {
        const res = await client.users.getByUsernames(usernames, {
          userFields: finalUserFields,
          expansions: finalExpansions,
          tweetFields: finalTweetFields,
          requestOptions: { raw: true },
        } as any);
        await printRawResponse(res as unknown as Response, g.pretty);
        return 0;
      }

      const data = await client.users.getByUsernames(usernames, {
        userFields: finalUserFields,
        expansions: finalExpansions,
        tweetFields: finalTweetFields,
      } as any);
      jsonPrint(data, { pretty: g.pretty });
      return 0;
    }

    printError(`Unknown users subcommand: ${sub}`);
    return 1;
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      printError(err.message);
      return 1;
    }
    if (err instanceof ApiError) {
      jsonPrint(
        {
          error: {
            message: err.message,
            status: err.status,
            statusText: err.statusText,
            data: err.data,
            headers: Object.fromEntries(err.headers.entries()),
          },
        },
        { pretty: g.pretty }
      );
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
  const sub = args[0];
  const subArgs = args.slice(1);

  if (g.help || sub === undefined || sub === "--help") {
    printPostsHelp({ all: g.helpAll });
    return 0;
  }

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

  const presetDefaults = preset === "post" ? {
    tweetFields: ["created_at", "public_metrics", "author_id", "conversation_id"],
    expansions: ["author_id"],
    userFields: ["username", "name", "verified"],
  } : {};

  const finalTweetFields = tweetFields ?? (presetDefaults as any).tweetFields;
  const finalExpansions = expansions ?? (presetDefaults as any).expansions;
  const finalUserFields = userFields ?? (presetDefaults as any).userFields;
  const finalMediaFields = mediaFields;
  const finalPollFields = pollFields;
  const finalPlaceFields = placeFields;

  try {
    if (sub === "by-id") {
      const input = subArgs[0];
      if (!input) {
        printError("Missing required <id|url>.");
        return 1;
      }

      const id = isProbablyUrl(input) ? extractPostId(input) : input;
      if (!id) {
        printError(
          "Could not determine a Post ID.\nExpected a numeric ID or a URL like https://x.com/<user>/status/<id>."
        );
        return 1;
      }

      const client = clientFactory();

      if (g.raw) {
        const res = await client.posts.getById(id, {
          tweetFields: finalTweetFields,
          expansions: finalExpansions,
          userFields: finalUserFields,
          mediaFields: finalMediaFields,
          pollFields: finalPollFields,
          placeFields: finalPlaceFields,
          requestOptions: { raw: true },
        } as any);
        await printRawResponse(res as unknown as Response, g.pretty);
        return 0;
      }

      const data = await client.posts.getById(id, {
        tweetFields: finalTweetFields,
        expansions: finalExpansions,
        userFields: finalUserFields,
        mediaFields: finalMediaFields,
        pollFields: finalPollFields,
        placeFields: finalPlaceFields,
      } as any);
      jsonPrint(data, { pretty: g.pretty });
      return 0;
    }

    if (sub === "by-ids") {
      const ids = subArgs;
      if (ids.length === 0) {
        printError("Missing required <id...> (one or more IDs).\nTip: up to 100 IDs per request.");
        return 1;
      }

      const client = clientFactory();

      if (g.raw) {
        const res = await client.posts.getByIds(ids, {
          tweetFields: finalTweetFields,
          expansions: finalExpansions,
          userFields: finalUserFields,
          mediaFields: finalMediaFields,
          pollFields: finalPollFields,
          placeFields: finalPlaceFields,
          requestOptions: { raw: true },
        } as any);
        await printRawResponse(res as unknown as Response, g.pretty);
        return 0;
      }

      const data = await client.posts.getByIds(ids, {
        tweetFields: finalTweetFields,
        expansions: finalExpansions,
        userFields: finalUserFields,
        mediaFields: finalMediaFields,
        pollFields: finalPollFields,
        placeFields: finalPlaceFields,
      } as any);
      jsonPrint(data, { pretty: g.pretty });
      return 0;
    }

    printError(`Unknown posts subcommand: ${sub}`);
    return 1;
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      printError(err.message);
      return 1;
    }
    if (err instanceof ApiError) {
      jsonPrint(
        {
          error: {
            message: err.message,
            status: err.status,
            statusText: err.statusText,
            data: err.data,
            headers: Object.fromEntries(err.headers.entries()),
          },
        },
        { pretty: g.pretty }
      );
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
    // Running a command group with no subcommand should show help and not require auth.
    if (cmdArgs.length === 0) {
      if (cmd === "users") printUsersHelp({ all: false });
      else printPostsHelp({ all: false });
      return 0;
    }

    // Token required for any API calls; create lazily so help/usage errors don't require auth.
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
