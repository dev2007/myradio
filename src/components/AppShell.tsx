"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Station } from "@/types/station";
import { RadioHome } from "./RadioHome";
import { HomeBrowser } from "./HomeBrowser";
import { ThemeToggle } from "./ThemeToggle";

const SWIPE_THRESHOLD = 60;

interface AppShellProps {
  initialItems: Station[];
  initialError: string | null;
}

export function AppShell({ initialItems, initialError }: AppShellProps) {
  const [page, setPage] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onPlay = () => setPage(0);
    window.addEventListener("radioo:play", onPlay);
    return () => window.removeEventListener("radioo:play", onPlay);
  }, []);

  const goToPage = useCallback((next: number) => {
    setPage(Math.min(Math.max(next, 0), 1));
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) {
        goToPage(1);
      } else {
        goToPage(0);
      }
    },
    [goToPage]
  );

  const tabs = (
    <div
      role="tablist"
      aria-label="页面切换"
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={page === 0}
        aria-label="收音机页"
        onClick={() => goToPage(0)}
        className={`h-8 min-w-[44px] rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          page === 0 ? "bg-primary text-white" : "text-text-muted hover:text-text"
        }`}
      >
        收音机
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={page === 1}
        aria-label="频道浏览页"
        onClick={() => goToPage(1)}
        className={`h-8 min-w-[44px] rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          page === 1 ? "bg-primary text-white" : "text-text-muted hover:text-text"
        }`}
      >
        频道
      </button>
    </div>
  );

  const backRow = (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => goToPage(0)}
        aria-label="返回收音机页"
        className="flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3.5L5.5 8L10 12.5" />
        </svg>
        返回收音机
      </button>
    </div>
  );

  const dataSource = (
    <footer className="mt-10 text-center text-xs text-text-muted">
      数据来源：
      <a
        href="https://www.radio-browser.info"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary-light transition-colors hover:text-accent"
      >
        Radio Browser
      </a>
      （开放社区电台数据库）· 手机上左右滑动可切换页面
    </footer>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="safe-top flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-lg text-white shadow-sm"
          >
            📻
          </span>
          <h1 className="text-lg font-bold tracking-tight text-text">我的广播</h1>
        </div>
        {tabs}
        <ThemeToggle />
      </header>

      <div
        className="min-h-0 flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full w-[200%] transition-transform duration-300 ease-out"
          style={{ transform: page === 0 ? "translateX(0)" : "translateX(-50%)" }}
        >
          <section
            aria-label="收音机"
            aria-hidden={page !== 0}
            className="h-full w-1/2 overflow-hidden"
          >
            <RadioHome onBrowse={() => goToPage(1)} />
          </section>

          <section
            aria-label="全部电台"
            aria-hidden={page !== 1}
            className="no-scrollbar h-full w-1/2 overflow-y-auto px-4 pb-8 pt-4 sm:px-6"
          >
            <div className="mx-auto w-full max-w-6xl">
              {backRow}
              <HomeBrowser initialItems={initialItems} initialError={initialError} />
              {dataSource}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
