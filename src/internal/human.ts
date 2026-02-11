import {
  compactWhitespace,
  formatDateShort,
  formatNumber,
  getObject,
  printLine,
  renderTable,
  style,
  toArray,
  truncate,
} from "./util.ts";

function printWarnings(response: Record<string, unknown>): void {
  const errors = toArray(response["errors"]);
  if (errors.length === 0) return;

  printLine("");
  printLine(style(`Partial errors: ${errors.length}`, "yellow"));
}

function printMeta(response: Record<string, unknown>): void {
  const meta = getObject(response["meta"]);
  if (!meta) return;

  const resultCount = typeof meta["result_count"] === "number" ? meta["result_count"] : undefined;
  const nextToken = typeof meta["next_token"] === "string" ? meta["next_token"] : undefined;

  if (resultCount === undefined && nextToken === undefined) return;

  printLine("");
  const parts: string[] = [];
  if (resultCount !== undefined) parts.push(`result_count=${resultCount}`);
  if (nextToken !== undefined) parts.push(`next_token=${nextToken}`);
  printLine(style(`Meta: ${parts.join(" ")}`, "dim"));
}

export function printUsersHuman(response: unknown): void {
  const obj = getObject(response);
  if (!obj) {
    printLine("No response data.");
    return;
  }

  const users = toArray(obj["data"]).map(getObject).filter((x): x is Record<string, unknown> => Boolean(x));

  if (users.length === 0) {
    printLine(style("No users returned.", "yellow"));
    printWarnings(obj);
    printMeta(obj);
    return;
  }

  printLine(style(`Users (${users.length})`, "cyan"));

  const headers = ["ID", "Username", "Name", "Verified", "Followers", "Posts"];
  const rows = users.map((user) => {
    const metrics = getObject(user["public_metrics"]);
    const username = typeof user["username"] === "string" ? `@${user["username"]}` : "-";
    const verified = user["verified"] === true ? style("yes", "green") : "no";

    return [
      String(user["id"] ?? "-"),
      truncate(username, 24),
      truncate(String(user["name"] ?? "-"), 28),
      verified,
      formatNumber(metrics?.["followers_count"]),
      formatNumber(metrics?.["tweet_count"]),
    ];
  });

  for (const line of renderTable(headers.map((h) => style(h, "bold")), rows)) {
    printLine(line);
  }

  if (users.length === 1) {
    const description = users[0]?.["description"];
    if (typeof description === "string" && description.trim().length > 0) {
      printLine("");
      printLine(style("Bio", "bold"));
      printLine(description.trim());
    }
  }

  printWarnings(obj);
  printMeta(obj);
}

export function printPostsHuman(response: unknown): void {
  const obj = getObject(response);
  if (!obj) {
    printLine("No response data.");
    return;
  }

  const posts = toArray(obj["data"]).map(getObject).filter((x): x is Record<string, unknown> => Boolean(x));

  if (posts.length === 0) {
    printLine(style("No posts returned.", "yellow"));
    printWarnings(obj);
    printMeta(obj);
    return;
  }

  printLine(style(`Posts (${posts.length})`, "cyan"));

  const headers = ["ID", "Author", "Created", "Likes", "Replies", "Reposts", "Text"];
  const rows = posts.map((post) => {
    const metrics = getObject(post["public_metrics"]);
    const text = typeof post["text"] === "string" ? compactWhitespace(post["text"]) : "-";
    const repostCount =
      typeof metrics?.["retweet_count"] === "number"
        ? metrics["retweet_count"]
        : metrics?.["repost_count"];

    return [
      String(post["id"] ?? "-"),
      String(post["author_id"] ?? "-"),
      formatDateShort(post["created_at"]),
      formatNumber(metrics?.["like_count"]),
      formatNumber(metrics?.["reply_count"]),
      formatNumber(repostCount),
      truncate(text, 72),
    ];
  });

  for (const line of renderTable(headers.map((h) => style(h, "bold")), rows)) {
    printLine(line);
  }

  printWarnings(obj);
  printMeta(obj);
}

export function printTrendsHuman(response: unknown): void {
  const obj = getObject(response);
  if (!obj) {
    printLine("No response data.");
    return;
  }

  const trends = toArray(obj["data"]).map(getObject).filter((x): x is Record<string, unknown> => Boolean(x));

  if (trends.length === 0) {
    printLine(style("No trends returned.", "yellow"));
    printWarnings(obj);
    return;
  }

  printLine(style(`Trends (${trends.length})`, "cyan"));

  const headers = ["Name", "Post Count"];
  const rows = trends.map((trend) => {
    const name =
      typeof trend["trend_name"] === "string"
        ? trend["trend_name"]
        : typeof trend["trendName"] === "string"
          ? trend["trendName"]
          : typeof trend["name"] === "string"
            ? trend["name"]
            : "-";

    const count =
      trend["tweet_count"] ??
      trend["tweetCount"] ??
      trend["tweet_volume"] ??
      trend["tweetVolume"] ??
      trend["post_count"] ??
      trend["postCount"];

    return [
      truncate(String(name), 64),
      formatNumber(count),
    ];
  });

  for (const line of renderTable(headers.map((h) => style(h, "bold")), rows)) {
    printLine(line);
  }

  printWarnings(obj);
}

export function printWoeidMatchesHuman(
  query: string,
  matches: Array<{
    woeid: number;
    placeName: string;
    country: string;
    countryCode?: string;
    placeType: string;
  }>
): void {
  if (matches.length === 0) {
    printLine(style(`No WOEID matches for '${query}'.`, "yellow"));
    return;
  }

  printLine(style(`WOEID matches for '${query}'`, "cyan"));

  const headers = ["WOEID", "Place", "Country", "Code", "Type"];
  const rows = matches.map((m) => [
    String(m.woeid),
    truncate(m.placeName, 32),
    truncate(m.country || "-", 24),
    m.countryCode ?? "-",
    m.placeType || "-",
  ]);

  for (const line of renderTable(headers.map((h) => style(h, "bold")), rows)) {
    printLine(line);
  }
}

export function printRawHuman(payload: {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
}): void {
  const ok = payload.status >= 200 && payload.status < 300;
  const statusLabel = `${payload.status} ${payload.statusText}`.trim();
  printLine(ok ? style(`HTTP ${statusLabel}`, "green") : style(`HTTP ${statusLabel}`, "red"));

  const importantHeaders = [
    "x-rate-limit-limit",
    "x-rate-limit-remaining",
    "x-rate-limit-reset",
    "content-type",
  ];

  const present: string[] = [];
  for (const name of importantHeaders) {
    const val = payload.headers[name];
    if (val !== undefined) present.push(`${name}: ${val}`);
  }

  if (present.length > 0) {
    printLine("");
    for (const line of present) {
      printLine(style(line, "dim"));
    }
  }

  printLine("");
  if (typeof payload.body === "string") {
    printLine(payload.body);
    return;
  }

  printLine(JSON.stringify(payload.body, null, 2));
}
