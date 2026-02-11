import {
  compactWhitespace,
  formatDateShort,
  formatNumber,
  getUsableTerminalWidth,
  getObject,
  printLine,
  renderTable,
  style,
  toArray,
  wrapText,
} from "./util.ts";
import {
  collectPostMedia,
  formatPostMediaDownloadable,
  formatPostMediaSummary,
} from "./media.ts";

function pickField(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function pickObjectField(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = getObject(obj[key]);
    if (value) return value;
  }
  return undefined;
}

function pickStringField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  const value = pickField(obj, keys);
  return typeof value === "string" ? value : undefined;
}

function pickNumberField(obj: Record<string, unknown>, keys: string[]): number | undefined {
  const value = pickField(obj, keys);
  return typeof value === "number" ? value : undefined;
}

function printWarnings(response: Record<string, unknown>): void {
  const errors = toArray(response["errors"]);
  if (errors.length === 0) return;

  printLine("");
  printLine(style(`Partial errors: ${errors.length}`, "yellow"));
}

function printMeta(response: Record<string, unknown>): void {
  const meta = getObject(response["meta"]);
  if (!meta) return;

  const resultCount = pickNumberField(meta, ["result_count", "resultCount"]);
  const nextToken = pickStringField(meta, ["next_token", "nextToken"]);

  if (resultCount === undefined && nextToken === undefined) return;

  printLine("");
  const parts: string[] = [];
  if (resultCount !== undefined) parts.push(`result_count=${resultCount}`);
  if (nextToken !== undefined) parts.push(`next_token=${nextToken}`);
  printLine(style(`Meta: ${parts.join(" ")}`, "dim"));
}

function printTable(
  headers: string[],
  rows: string[][],
  minWidths?: number[],
  widthOverride?: number
): void {
  const width = widthOverride ?? getUsableTerminalWidth(80);
  const lines = renderTable(
    headers.map((h) => style(h, "bold")),
    rows,
    { maxWidth: width, minWidths }
  );

  for (const line of lines) {
    printLine(line);
  }
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
    const metrics = pickObjectField(user, ["public_metrics", "publicMetrics"]);
    const usernameRaw = pickStringField(user, ["username"]);
    const username = usernameRaw ? `@${usernameRaw}` : "-";
    const verifiedType = pickStringField(user, ["verified_type", "verifiedType"]);
    const isVerified =
      pickField(user, ["verified"]) === true ||
      (typeof verifiedType === "string" && verifiedType.length > 0 && verifiedType !== "none");
    const verified = isVerified ? style("yes", "green") : "no";

    return [
      String(user["id"] ?? "-"),
      username,
      String(user["name"] ?? "-"),
      verified,
      formatNumber(pickField(metrics ?? {}, ["followers_count", "followersCount"])),
      formatNumber(pickField(metrics ?? {}, ["tweet_count", "tweetCount"])),
    ];
  });

  printTable(headers, rows, [8, 9, 12, 8, 9, 5]);

  if (users.length === 1) {
    const description = users[0]?.["description"];
    if (typeof description === "string" && description.trim().length > 0) {
      printLine("");
      printLine(style("Bio", "bold"));
      const bioWidth = Math.max(20, getUsableTerminalWidth(80));
      for (const line of wrapText(description.trim(), bioWidth)) {
        printLine(line);
      }
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
  const { summaries } = collectPostMedia(response);
  const includes = getObject(obj["includes"]);
  const includeUsers = toArray(includes?.["users"])
    .map(getObject)
    .filter((x): x is Record<string, unknown> => Boolean(x));
  const userById = new Map<string, string>();
  for (const user of includeUsers) {
    const id = pickStringField(user, ["id"]);
    const username = pickStringField(user, ["username"]);
    if (id && username) userById.set(id, `@${username}`);
  }

  const tableWidth = getUsableTerminalWidth(80);
  const prepared = posts.map((post) => {
    const metrics = pickObjectField(post, ["public_metrics", "publicMetrics"]);
    const text = typeof post["text"] === "string" ? compactWhitespace(post["text"]) : "-";
    const repostCount = pickField(metrics ?? {}, [
      "retweet_count",
      "retweetCount",
      "repost_count",
      "repostCount",
    ]);
    const postId = pickStringField(post, ["id"]) ?? "";
    const authorId = pickStringField(post, ["author_id", "authorId"]);
    const author = authorId ? userById.get(authorId) ?? authorId : "-";
    const mediaSummary = summaries.get(postId);

    return {
      id: String(post["id"] ?? "-"),
      author,
      created: formatDateShort(pickField(post, ["created_at", "createdAt"])),
      likes: formatNumber(pickField(metrics ?? {}, ["like_count", "likeCount"])),
      replies: formatNumber(pickField(metrics ?? {}, ["reply_count", "replyCount"])),
      reposts: formatNumber(repostCount),
      media: formatPostMediaSummary(mediaSummary),
      downloadable: formatPostMediaDownloadable(mediaSummary),
      text,
    };
  });

  if (tableWidth < 100) {
    const headers = ["ID", "Author", "Created", "Media", "DL", "Text"];
    const rows = prepared.map((post) => [
      post.id,
      post.author,
      post.created,
      post.media,
      post.downloadable,
      post.text,
    ]);

    printTable(headers, rows, [19, 12, 10, 5, 2, 20], tableWidth);
    printWarnings(obj);
    printMeta(obj);
    return;
  }

  const headers = ["ID", "Author", "Created", "Likes", "Replies", "Reposts", "Media", "DL", "Text"];
  const rows = prepared.map((post) => [
    post.id,
    post.author,
    post.created,
    post.likes,
    post.replies,
    post.reposts,
    post.media,
    post.downloadable,
    post.text,
  ]);

  printTable(headers, rows, [19, 8, 10, 5, 7, 7, 5, 2, 20], tableWidth);

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
      String(name),
      formatNumber(count),
    ];
  });

  printTable(headers, rows, [20, 8]);

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
    m.placeName,
    m.country || "-",
    m.countryCode ?? "-",
    m.placeType || "-",
  ]);

  printTable(headers, rows, [6, 12, 10, 4, 6]);
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
