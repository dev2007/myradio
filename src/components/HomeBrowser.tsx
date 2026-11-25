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
  const [items, setItems] = useState<Station[]>(initialItems);
  const [loading, setLoading] = useState(false);
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

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ order: "clickcount", limit: "50" });
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
      setItems(data.items);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, country, language, tag]);

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
      <StationGrid items={items} loading={loading} error={error} onRetry={load} />
    </div>
  );
}
