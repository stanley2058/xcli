import { printLine } from "./util.ts";

type HelpOpts = { all: boolean };

export function printRootHelp(opts: HelpOpts): void {
  printLine("xcli - CLI for X API v2 (read-only)");
  printLine("");
  printLine("Usage:");
  printLine("  xcli [--help] [--help-all] <command> [args] [options]");
  printLine("");
  printLine("Commands:");
  printLine("  users         Lookup users + user search");
  printLine("  posts         Lookup posts + post search");
  printLine("  trends        Lookup trends by WOEID or location");
  printLine("  fields        Show field/expansion references");
  printLine("");
  printLine("Quick examples:");
  printLine("  xcli users XDevelopers");
  printLine("  xcli users 2244994945");
  printLine("  xcli posts https://x.com/XDevelopers/status/1228393702244134912");
  printLine("  xcli posts search recent --query 'from:XDevelopers -is:retweet'");
  printLine("  xcli users search --query 'python developer'");
  printLine("  xcli trends 1");
  printLine("  xcli trends new york");
  printLine("  xcli trends search new york");
  printLine("  xcli posts 1228393702244134912 1227640996038684673");
  printLine("  xcli users by-username XDevelopers   # explicit mode");
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
  printLine("  --help-all                 Show verbose help (all options)");
  printLine("  --json                     Output compact JSON");
  printLine("  --json-pretty              Output pretty JSON");
  printLine("  --raw                      Output raw HTTP wrapper (status/headers/body)");
  printLine("  --bearer-token <token>     Override env var X_API_BEARER_TOKEN");
  printLine("  --timeout <ms>             Request timeout in milliseconds");
  printLine("  --retries <n>              Max retries for transient failures");
  printLine("");
  printLine("Human-readable output is default and uses color when enabled.");
  printLine("Color rules: honors TTY, NO_COLOR, and FORCE_COLOR.");
}

export function printUsersHelp(opts: HelpOpts): void {
  printLine("xcli users - user lookup and search");
  printLine("");
  printLine("Inferred usage (default):");
  printLine("  xcli users <id|ids|username|usernames|url|urls>");
  printLine("");
  printLine("Explicit usage (also supported):");
  printLine("  xcli users by-id <id>");
  printLine("  xcli users by-username <username|@username>");
  printLine("  xcli users by-ids <id...>");
  printLine("  xcli users by-usernames <username...>");
  printLine("  xcli users search <query...>");
  printLine("");
  printLine("Examples:");
  printLine("  xcli users XDevelopers");
  printLine("  xcli users @XDevelopers");
  printLine("  xcli users 2244994945 783214");
  printLine("  xcli users https://x.com/XDevelopers");
  printLine("  xcli users https://x.com/XDevelopers/status/1228393702244134912");
  printLine("  xcli users search --query 'python developer'");
  printLine("  xcli users search bun typescript");

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
  printLine("  --query <text>              Search query (alternative to positional query)");
  printLine("  --max-results <n>           Search max results (1-1000)");
  printLine("  --next-token <token>        Search pagination token");
  printLine("  --json                      Output compact JSON");
  printLine("  --json-pretty               Output pretty JSON");
  printLine("  --raw                       Raw HTTP output (debug)");
  printLine("");
  printLine("Help for fields:");
  printLine("  xcli fields users");
}

export function printPostsHelp(opts: HelpOpts): void {
  printLine("xcli posts - post lookup and search");
  printLine("");
  printLine("Inferred usage (default):");
  printLine("  xcli posts <id|ids|url|urls>");
  printLine("");
  printLine("Explicit usage (also supported):");
  printLine("  xcli posts by-id <id|url>");
  printLine("  xcli posts by-ids <id...>");
  printLine("  xcli posts search [recent|all] <query...>");
  printLine("");
  printLine("Examples:");
  printLine("  xcli posts 1228393702244134912");
  printLine("  xcli posts 1228393702244134912 1227640996038684673");
  printLine("  xcli posts https://x.com/XDevelopers/status/1228393702244134912");
  printLine("  xcli posts search recent --query 'from:XDevelopers -is:retweet'");
  printLine("  xcli posts search all --query 'lang:en #ai -is:retweet'");

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
  printLine("  --query <text>              Search query (alternative to positional query)");
  printLine("  --max-results <n>           Search max results (recent: 10-100, all: 10-500)");
  printLine("  --next-token <token>        Search pagination token");
  printLine("  --start-time <iso8601>      Search lower time bound");
  printLine("  --end-time <iso8601>        Search upper time bound");
  printLine("  --since-id <id>             Return posts newer than this ID");
  printLine("  --until-id <id>             Return posts older than this ID");
  printLine("  --sort-order <recency|relevancy>");
  printLine("  --json                      Output compact JSON");
  printLine("  --json-pretty               Output pretty JSON");
  printLine("  --raw                       Raw HTTP output (debug)");
  printLine("");
  printLine("Help for fields:");
  printLine("  xcli fields posts");
}

export function printTrendsHelp(opts: HelpOpts): void {
  printLine("xcli trends - trends by WOEID");
  printLine("");
  printLine("Usage:");
  printLine("  xcli trends <woeid|location query>");
  printLine("  xcli trends by-woeid <woeid|location query>");
  printLine("  xcli trends search <location query>");
  printLine("");
  printLine("Examples:");
  printLine("  xcli trends 1");
  printLine("  xcli trends 23424977");
  printLine("  xcli trends new york");
  printLine("  xcli trends search new york");

  if (!opts.all) {
    printLine("");
    printLine("Run `xcli trends --help-all` to see all trends options.");
    return;
  }

  printLine("");
  printLine("Options:");
  printLine("  --max-trends <n>            Max trends to return (1-50)");
  printLine("  --trend-fields <csv>        Maps to trend.fields");
  printLine("  --query <text>              Query text for trends search/resolve");
  printLine("  --limit <n>                 WOEID search result limit (1-100)");
  printLine("  --json                      Output compact JSON");
  printLine("  --json-pretty               Output pretty JSON");
  printLine("  --raw                       Raw HTTP output (debug)");
  printLine("");
  printLine("Help for fields:");
  printLine("  xcli fields trends");
}

export function printFieldsHelp(
  opts: HelpOpts & { topic?: string }
): void {
  const topic = opts.topic;

  if (!opts.all || !topic) {
    printLine("xcli fields - field and expansion references");
    printLine("");
    printLine("Usage:");
    printLine("  xcli fields <users|posts|trends>");
    printLine("");
    printLine("Examples:");
    printLine("  xcli fields users");
    printLine("  xcli fields posts");
    printLine("  xcli fields trends");
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
    printLine("  - To include related objects use expansions, then request fields for those objects.");
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

  if (topic === "trends") {
    printLine("Trend fields");
    printLine("");
    printLine("Docs:");
    printLine("  https://docs.x.com/x-api/trends/get-trends-by-woeid");
    printLine("");
    printLine("Common trend.fields values:");
    printLine("  trend_name,tweet_count");
    return;
  }

  printLine("Unknown topic. Use: xcli fields users|posts|trends");
}
