"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterOption, Station } from "@/types/station";
import { FilterBar } from "./FilterBar";
import { StationGrid } from "./StationGrid";

async function fetchFilters(type: "countries" | "languages" | "tags"): Promise<FilterOption[]> {
  try {
    const res = await fetch(`/api/filters?type=${type}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items: FilterOption[] };
    return data.items;
  } catch {
    return [];
  }
}

type SortOrder = "clickcount" | "votes";

const PAGE_SIZE = 50;

interface HomeBrowserProps {
  initialItems: Station[];
  initialError: string | null;
}

export function HomeBrowser({ initialItems, initialError }: HomeBrowserProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [order, setOrder] = useState<SortOrder>("clickcount");
  const [items, setItems] = useState<Station[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(initialError);
  const [countries, setCountries] = useState<FilterOption[]>([]);
  const [languages, setLanguages] = useState<FilterOption[]>([]);
  const [tags, setTags] = useState<FilterOption[]>([]);
  const firstRender = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // 搜索防抖 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // 筛选项列表：挂载后并行拉取（走代理缓存）
  useEffect(() => {
    fetchFilters("countries").then(setCountries);
    fetchFilters("languages").then(setLanguages);
    fetchFilters("tags").then(setTags);
  }, []);

  /** offset=0 时重置列表（筛选变化/重试），否则在已加载列表后追加（加载更多） */
  const load = useCallback(
    async (offset = 0) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (offset === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams({
          order,
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (debouncedQuery) params.set("name", debouncedQuery);
        if (country) params.set("countrycode", country);
        if (language) params.set("language", language);
        if (tag) params.set("tag", tag);
        const res = await fetch(`/api/stations?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error("电台列表获取失败，请稍后重试");
        }
        const data = (await res.json()) as { items: Station[] };
        setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
        setHasMore(data.items.length >= PAGE_SIZE);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "网络异常，请稍后重试");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQuery, country, language, tag, order]
  );

  // 筛选/搜索变化联动刷新；首屏无筛选时复用服务端渲染数据
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (!debouncedQuery && !country && !language && !tag && !initialError) return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, country, language, tag]);

  const hasActiveFilters = Boolean(debouncedQuery || country || language || tag);

  const clearAll = useMemo(
    () => () => {
      setQuery("");
      setCountry(null);
      setLanguage(null);
      setTag(null);
    },
    []
  );

  return (
    <div className="flex flex-col gap-5">
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        countries={countries}
        languages={languages}
        tags={tags}
        country={country}
        language={language}
        tag={tag}
        order={order}
        onOrderChange={(v) => setOrder(v === "votes" ? "votes" : "clickcount")}
        onCountryChange={setCountry}
        onLanguageChange={setLanguage}
        onTagChange={setTag}
        onClearAll={clearAll}
        hasActiveFilters={hasActiveFilters}
      />
      {loading && items.length > 0 && (
        <p role="status" className="text-xs text-text-muted">
          正在加载…
        </p>
      )}
      {items.length > 0 && (
        <p className="text-xs text-text-muted">
          按{order === "votes" ? "投票数" : "收听量"}排序 · 已加载 {items.length} 个电台
        </p>
      )}
      <StationGrid
        items={items}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAll}
      />
      {!loading && !error && items.length > 0 && (
        <div className="flex flex-col items-center gap-2 pb-4">
          {hasMore ? (
            <button
              type="button"
              onClick={() => void load(items.length)}
              disabled={loadingMore}
              aria-busy={loadingMore}
              className="min-h-[44px] rounded-full border border-border bg-surface px-8 text-sm font-medium text-text transition-colors hover:border-primary/40 hover:bg-surface-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {loadingMore ? "正在加载…" : "加载更多"}
            </button>
          ) : (
            <p className="text-xs text-text-muted">已加载全部 {items.length} 个电台</p>
          )}
        </div>
      )}
    </div>
  );
}
