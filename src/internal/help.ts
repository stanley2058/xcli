import { printLine } from "./util.ts";

type HelpOpts = { all: boolean };

export function printRootHelp(opts: HelpOpts): void {
  printLine("xcli - CLI for X API v2 (read-only)");
  printLine("");
  printLine("Usage:");
  printLine("  xcli [--help] [--help-all] <command> [args] [options]");
  printLine("");
  printLine("Commands:");
  printLine("  users         Read user data (lookup endpoints)");
  printLine("  posts         Read post data (lookup endpoints)");
  printLine("  fields        Show field/expansion references");
  printLine("");
  printLine("Examples:");
  printLine("  xcli users by-username XDevelopers --pretty");
  printLine("  xcli posts by-id 1228393702244134912 --pretty");
  printLine("  xcli posts by-id https://x.com/XDevelopers/status/1228393702244134912");
  printLine("  xcli fields users");
  printLine("");
  printLine("Auth:");
  printLine("  Set X_API_BEARER_TOKEN in your environment.");

  if (!opts.all) {
    printLine("");
    printLine("Run `xcli --help-all` to see all global options.");
    return;
  }

  printLine("");
  printLine("Global options:");
  printLine("  -h, --help                 Show help for a command");
  printLine("  --help-all                  Show verbose help (all options)");
  printLine("  --pretty                    Pretty-print JSON output");
  printLine("  --raw                       Output raw HTTP response wrapper (status/headers/body)");
  printLine("  --bearer-token <token>      Override env var X_API_BEARER_TOKEN");
  printLine("  --timeout <ms>              Request timeout in milliseconds");
  printLine("  --retries <n>               Max retries for transient failures");
}

export function printUsersHelp(opts: HelpOpts): void {
  printLine("xcli users - user lookup");
  printLine("");
  printLine("Usage:");
  printLine("  xcli users [--help] <subcommand> [args] [options]");
  printLine("");
  printLine("Subcommands:");
  printLine("  by-id <id>");
  printLine("  by-username <username|@username>");
  printLine("  by-ids <id...>");
  printLine("  by-usernames <username...>");
  printLine("");
  printLine("Examples:");
  printLine("  xcli users by-id 2244994945 --pretty");
  printLine("  xcli users by-username XDevelopers --preset profile --pretty");
  printLine("  xcli users by-usernames XDevelopers X elonmusk --user-fields created_at,verified");

  if (!opts.all) {
    printLine("");
    printLine("Run `xcli users --help-all` to see all users options.");
    return;
  }

  printLine("");
  printLine("Options:");
  printLine("  --preset <minimal|profile>  Field preset (default: minimal)");
  printLine("  --user-fields <csv>         Maps to user.fields");
  printLine("  --expansions <csv>          Maps to expansions");
  printLine("  --tweet-fields <csv>        Maps to tweet.fields (when expansions include tweets)");
  printLine("");
  printLine("Help for fields:");
  printLine("  xcli fields users");
}

export function printPostsHelp(opts: HelpOpts): void {
  printLine("xcli posts - post lookup");
  printLine("");
  printLine("Usage:");
  printLine("  xcli posts [--help] <subcommand> [args] [options]");
  printLine("");
  printLine("Subcommands:");
  printLine("  by-id <id|url>");
  printLine("  by-ids <id...>");
  printLine("");
  printLine("Examples:");
  printLine("  xcli posts by-id 1228393702244134912 --pretty");
  printLine("  xcli posts by-id https://x.com/XDevelopers/status/1228393702244134912 --pretty");
  printLine(
    "  xcli posts by-id 1228393702244134912 --preset post --tweet-fields created_at,public_metrics,author_id --expansions author_id --user-fields username,verified"
  );

  if (!opts.all) {
    printLine("");
    printLine("Run `xcli posts --help-all` to see all posts options.");
    return;
  }

  printLine("");
  printLine("Options:");
  printLine("  --preset <minimal|post>     Field preset (default: minimal)");
  printLine("  --tweet-fields <csv>        Maps to tweet.fields");
  printLine("  --expansions <csv>          Maps to expansions");
  printLine("  --user-fields <csv>         Maps to user.fields (when expansions include users)");
  printLine("  --media-fields <csv>        Maps to media.fields (when expanding media)");
  printLine("  --poll-fields <csv>         Maps to poll.fields (when expanding polls)");
  printLine("  --place-fields <csv>        Maps to place.fields (when expanding places)");
  printLine("");
  printLine("Help for fields:");
  printLine("  xcli fields posts");
}

export function printFieldsHelp(
  opts: HelpOpts & { topic?: string }
): void {
  const topic = opts.topic;

  if (!opts.all || !topic) {
    printLine("xcli fields - field and expansion references");
    printLine("");
    printLine("Usage:");
    printLine("  xcli fields <users|posts>");
    printLine("");
    printLine("Examples:");
    printLine("  xcli fields users");
    printLine("  xcli fields posts");
    return;
  }

  if (topic === "users") {
    printLine("User fields");
    printLine("");
    printLine("Docs:");
    printLine("  https://docs.x.com/x-api/fundamentals/fields");
    printLine("  https://docs.x.com/x-api/fundamentals/data-dictionary#user");
    printLine("");
    printLine("Common user.fields values (not exhaustive):");
    printLine(
      "  id,name,username,created_at,description,location,profile_image_url,protected,public_metrics,url,verified,pinned_tweet_id"
    );
    printLine("");
    printLine("Notes:");
    printLine("  - X API v2 returns minimal fields by default.");
    printLine("  - To include related objects you must use expansions, then request fields for those objects.");
    return;
  }

  if (topic === "posts") {
    printLine("Post (tweet) fields");
    printLine("");
    printLine("Docs:");
    printLine("  https://docs.x.com/x-api/fundamentals/fields");
    printLine("  https://docs.x.com/x-api/fundamentals/data-dictionary#tweet");
    printLine("");
    printLine("Common tweet.fields values (not exhaustive):");
    printLine(
      "  id,text,created_at,author_id,conversation_id,in_reply_to_user_id,lang,public_metrics,possibly_sensitive,referenced_tweets,entities,attachments"
    );
    printLine("");
    printLine("Common expansions (not exhaustive):");
    printLine("  author_id,attachments.media_keys,referenced_tweets.id");
    printLine("");
    printLine("Related object field params:");
    printLine("  user.fields, media.fields, poll.fields, place.fields");
    return;
  }

  printLine("Unknown topic. Use: xcli fields users|posts");
}
