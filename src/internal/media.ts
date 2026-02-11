import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";

import { getObject, toArray } from "./util.ts";

export type PostMediaSummary = {
  total: number;
  downloadable: number;
  byType: Record<string, number>;
};

export type DownloadablePostMedia = {
  postId: string;
  mediaKey: string;
  type: string;
  url: string;
  source: "url" | "preview_image_url";
};

export type MediaDownloadReport = {
  outputDir: string;
  attempted: number;
  downloaded: number;
  failed: number;
  files: string[];
  errors: string[];
};

function getString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const s = getString(value);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function getPostMediaKeys(post: Record<string, unknown>): string[] {
  const attachments = getObject(post["attachments"]);
  if (!attachments) return [];

  const raw = attachments["media_keys"] ?? attachments["mediaKeys"];
  return uniqueStrings(toArray(raw));
}

function pickDownloadUrl(media: Record<string, unknown>):
  | {
      url: string;
      source: "url" | "preview_image_url";
    }
  | undefined {
  const direct = getString(media["url"]);
  if (direct) {
    return { url: direct, source: "url" };
  }

  const preview = getString(media["preview_image_url"]) ?? getString(media["previewImageUrl"]);
  if (preview) {
    return { url: preview, source: "preview_image_url" };
  }

  return undefined;
}

export function collectPostMedia(response: unknown): {
  summaries: Map<string, PostMediaSummary>;
  downloadable: DownloadablePostMedia[];
} {
  const summaries = new Map<string, PostMediaSummary>();
  const downloadable: DownloadablePostMedia[] = [];

  const obj = getObject(response);
  if (!obj) return { summaries, downloadable };

  const posts = toArray(obj["data"]).map(getObject).filter((x): x is Record<string, unknown> => Boolean(x));
  const includes = getObject(obj["includes"]);
  const mediaObjects = toArray(includes?.["media"]).map(getObject).filter((x): x is Record<string, unknown> => Boolean(x));

  const mediaByKey = new Map<string, Record<string, unknown>>();
  for (const media of mediaObjects) {
    const mediaKey = getString(media["media_key"]) ?? getString(media["mediaKey"]);
    if (!mediaKey) continue;
    mediaByKey.set(mediaKey, media);
  }

  for (const post of posts) {
    const postId = getString(post["id"]) ?? "unknown";
    const mediaKeys = getPostMediaKeys(post);
    if (mediaKeys.length === 0) continue;

    const byType: Record<string, number> = {};
    let downloadableCount = 0;

    for (const mediaKey of mediaKeys) {
      const media = mediaByKey.get(mediaKey);
      const mediaType = getString(media?.["type"]) ?? "unknown";
      byType[mediaType] = (byType[mediaType] ?? 0) + 1;

      if (!media) continue;
      const picked = pickDownloadUrl(media);
      if (!picked) continue;

      downloadableCount += 1;
      downloadable.push({
        postId,
        mediaKey,
        type: mediaType,
        url: picked.url,
        source: picked.source,
      });
    }

    summaries.set(postId, {
      total: mediaKeys.length,
      downloadable: downloadableCount,
      byType,
    });
  }

  return { summaries, downloadable };
}

function mediaTypeShortName(mediaType: string): string {
  if (mediaType === "photo") return "img";
  if (mediaType === "video") return "vid";
  if (mediaType === "animated_gif") return "gif";
  if (mediaType === "unknown") return "unk";
  return mediaType.slice(0, 3).toLowerCase();
}

export function formatPostMediaSummary(summary: PostMediaSummary | undefined): string {
  if (!summary || summary.total === 0) return "-";

  const preferredOrder = ["photo", "video", "animated_gif", "unknown"];
  const orderedTypes = [
    ...preferredOrder.filter((t) => (summary.byType[t] ?? 0) > 0),
    ...Object.keys(summary.byType)
      .filter((t) => !preferredOrder.includes(t) && (summary.byType[t] ?? 0) > 0)
      .sort(),
  ];

  const parts = orderedTypes.map((type) => `${mediaTypeShortName(type)}${summary.byType[type]}`);
  return parts.length > 0 ? parts.join(",") : "-";
}

export function formatPostMediaDownloadable(summary: PostMediaSummary | undefined): string {
  if (!summary || summary.total === 0) return "-";
  return `${summary.downloadable}/${summary.total}`;
}

function sanitizeSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized.length > 0 ? sanitized : "item";
}

function resolveOutputDir(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return resolve(join(homedir(), trimmed.slice(2)));
  return resolve(trimmed);
}

function inferExtension(asset: DownloadablePostMedia): string {
  try {
    const pathExt = extname(new URL(asset.url).pathname).toLowerCase();
    if (/^\.[a-z0-9]{1,8}$/.test(pathExt)) return pathExt;
  } catch {
    // Ignore malformed URLs and fall back to type/source-based extension.
  }

  if (asset.type === "photo") return ".jpg";
  if (asset.source === "preview_image_url") return ".jpg";
  if (asset.type === "video") return ".mp4";
  if (asset.type === "animated_gif") return ".gif";
  return ".bin";
}

export async function downloadPostMediaAssets(
  assets: DownloadablePostMedia[],
  outputDirInput: string
): Promise<MediaDownloadReport> {
  const outputDir = resolveOutputDir(outputDirInput);
  await mkdir(outputDir, { recursive: true });

  const deduped = Array.from(
    new Map(assets.map((asset) => [`${asset.postId}|${asset.mediaKey}|${asset.url}`, asset])).values()
  );

  const report: MediaDownloadReport = {
    outputDir,
    attempted: deduped.length,
    downloaded: 0,
    failed: 0,
    files: [],
    errors: [],
  };

  for (const asset of deduped) {
    const fileName = `${sanitizeSegment(asset.postId)}_${sanitizeSegment(asset.mediaKey)}_${asset.source}${inferExtension(asset)}`;
    const filePath = join(outputDir, fileName);

    try {
      const res = await fetch(asset.url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
      }

      const bytes = await res.arrayBuffer();
      await writeFile(filePath, Buffer.from(bytes));
      report.downloaded += 1;
      report.files.push(filePath);
    } catch (err: unknown) {
      report.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      report.errors.push(`${asset.url} (${message})`);
    }
  }

  return report;
}
