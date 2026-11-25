"use client";

import type { Station } from "@/types/station";
import { StationCard } from "./StationCard";

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
      <div className="h-5 w-2/5 animate-pulse rounded-full bg-surface-2" />
    </div>
  );
}

interface StationGridProps {
  items: Station[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function StationGrid({ items, loading, error, onRetry }: StationGridProps) {
  if (loading && items.length === 0) {
    return (
      <div
        role="status"
        aria-label="电台列表加载中"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
        <span className="text-3xl" aria-hidden="true">📶</span>
        <p className="text-sm text-text-muted">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] rounded-full bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary-light"
        >
          重试
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
        <span className="text-3xl" aria-hidden="true">🔍</span>
        <p className="text-sm text-text-muted">没有找到匹配的电台，换个关键词试试</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((station) => (
        <StationCard key={station.uuid} station={station} />
      ))}
    </div>
  );
}
