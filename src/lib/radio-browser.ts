import type { FilterOption, Station, StationQuery } from "@/types/station";

/**
 * Radio Browser 开放 API 客户端（服务端使用）。
 * 官方镜像依次 fallback；单镜像请求超时 8s，总超时约 24s。
 * 文档：https://de1.api.radio-browser.info/
 */
const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

const UPSTREAM_TIMEOUT_MS = 8000;
const UA = "RadiooWeb/1.0 (radio-web-mvp)";

interface RawStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string | null;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  language: string;
  votes: number;
  clickcount: number;
  codec: string;
  bitrate: number;
  hls: number | boolean;
}

function splitTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function toStation(raw: RawStation): Station {
  return {
    uuid: raw.stationuuid,
    name: raw.name?.trim() || "未命名电台",
    streamUrl: raw.url_resolved || raw.url,
    homepage: raw.homepage || "",
    favicon: raw.favicon || "",
    tags: splitTags(raw.tags || ""),
    country: raw.country || "",
    countrycode: (raw.countrycode || "").toUpperCase(),
    language: raw.language || "",
    votes: raw.votes ?? 0,
    clickcount: raw.clickcount ?? 0,
    codec: raw.codec || "",
    bitrate: raw.bitrate ?? 0,
    hls: Boolean(raw.hls),
  };
}

async function fetchJson<T>(
  url: string,
  timeoutMs: number,
  revalidate = 0
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
      ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" }),
    });
    if (!res.ok) {
      throw new Error(`upstream ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 依次尝试官方镜像，全部失败才抛错 */
async function requestUpstream<T>(
  path: string,
  params: URLSearchParams,
  timeoutMs: number,
  revalidate = 0
): Promise<T> {
  let lastError: unknown;
  for (const base of MIRRORS) {
    try {
      return await fetchJson<T>(`${base}${path}?${params.toString()}`, timeoutMs, revalidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Radio Browser 不可用: ${lastError instanceof Error ? lastError.message : "unknown"}`
  );
}

/** 按条件搜索电台（revalidate>0 时走服务端缓存） */
export async function searchStations(
  query: StationQuery,
  revalidate = 0
): Promise<Station[]> {
  const params = new URLSearchParams({
    hidebroken: "true",
    order: query.order === "votes" ? "votes" : "clickcount",
    reverse: "true",
    limit: String(Math.min(Math.max(query.limit ?? 50, 1), 100)),
    offset: String(Math.max(query.offset ?? 0, 0)),
  });
  if (query.name) params.set("name", query.name);
  if (query.countrycode) params.set("countrycode", query.countrycode);
  if (query.language) params.set("language", query.language);
  if (query.tag) params.set("tag", query.tag);

  const raw = await requestUpstream<RawStation[]>(
    "/json/stations/search",
    params,
    UPSTREAM_TIMEOUT_MS,
    revalidate
  );
  return raw.map(toStation).filter((s) => Boolean(s.streamUrl));
}

type FilterKind = "countries" | "languages" | "tags";

interface RawFilterItem {
  name: string;
  iso_3166_1?: string;
  stationcount: number;
}

/** 获取国家/语言/类型筛选项（按电台数降序，过滤掉收录过少的项） */
export async function getFilterOptions(kind: FilterKind): Promise<FilterOption[]> {
  const raw = await requestUpstream<RawFilterItem[]>(
    `/json/${kind}`,
    new URLSearchParams({ order: "stationcount", reverse: "true" }),
    UPSTREAM_TIMEOUT_MS
  );
  const minCount = kind === "tags" ? 50 : 10;
  return raw
    .filter((item) => item.stationcount >= minCount && item.name)
    .slice(0, 80)
    .map((item) => ({
      value: kind === "countries" ? item.iso_3166_1 || item.name : item.name,
      label: item.name,
      count: item.stationcount,
    }));
}
