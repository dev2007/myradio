"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Station } from "@/types/station";
import { usePlayer } from "@/lib/player-context";
import { RadioHome } from "./RadioHome";
import { HomeBrowser } from "./HomeBrowser";
import { NowPlayingBar } from "./NowPlayingBar";
import { ThemeToggle } from "./ThemeToggle";
import { ToastHost } from "./ToastHost";

const SWIPE_THRESHOLD = 60;

interface AppShellProps {
  initialItems: Station[];
  initialError: string | null;
}

export function AppShell({ initialItems, initialError }: AppShellProps) {
  const [page, setPage] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeBlocked = useRef(false);
  const { current, playStation, toggle, setVolume, volume, playFromHistory } = usePlayer();

  useEffect(() => {
    const onPlay = () => setPage(0);
    window.addEventListener("radioo:play", onPlay);
    return () => window.removeEventListener("radioo:play", onPlay);
  }, []);

  // 全局键盘快捷键：空格 播放/暂停，↑↓ 音量 ±5%，←→ 历史中上一首/下一首。
  // 焦点在可交互元素（输入框/按钮/滑杆等）时让位给原生行为，避免双重触发
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && el.closest("input, textarea, select, button, [role='slider'], [role='menu']")) {
        return;
      }
      switch (e.key) {
        case " ":
          e.preventDefault();
          toggle();
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume(Math.min(volume + 0.05, 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume(Math.max(volume - 0.05, 0));
          break;
        case "ArrowLeft":
          e.preventDefault();
          playFromHistory("prev");
          break;
        case "ArrowRight":
          e.preventDefault();
          playFromHistory("next");
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle, setVolume, volume, playFromHistory]);

  // 分享链接 ?station=uuid 打开时自动播放该电台；
  // 成功后清除 URL 参数，避免刷新时意外重新自动播放
  const autoPlayRef = useRef(false);
  const currentRef = useRef<Station | null>(null);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    if (autoPlayRef.current) return;
    const uuid = new URLSearchParams(window.location.search).get("station");
    if (!uuid) return;
    autoPlayRef.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      try {
        const res = await fetch(`/api/stations?uuid=${encodeURIComponent(uuid)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: Station[] };
        // 拉取期间用户手动开播则让位
        if (!currentRef.current && data.items[0]) {
          playStation(data.items[0]);
        }
      } catch {
        // 静默失败：用户可手动选择电台
      }
    })();
  }, [playStation]);

  const goToPage = useCallback((next: number) => {
    setPage(Math.min(Math.max(next, 0), 1));
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    // 起点在按钮/旋钮上时不判定滑动：拖调台旋钮（水平移动）不再误切页
    const el = e.target as HTMLElement | null;
    swipeBlocked.current = !!el?.closest("button, [role='slider']");
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || swipeBlocked.current) return;
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
        className={`relative h-8 min-w-[44px] rounded-full px-3 text-xs font-semibold transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5 after:rounded-full after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          page === 0 ? "bg-surface-2 text-text" : "text-text-muted hover:text-text"
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
        className={`relative h-8 min-w-[44px] rounded-full px-3 text-xs font-semibold transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5 after:rounded-full after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          page === 1 ? "bg-surface-2 text-text" : "text-text-muted hover:text-text"
        }`}
      >
        频道
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
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <header className="safe-top flex items-center justify-between gap-2 border-b border-border px-3 py-2 min-[420px]:gap-3 min-[420px]:px-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-lg text-white shadow-sm"
          >
            📻
          </span>
          <h1 className="hidden text-lg font-bold tracking-tight text-text min-[420px]:block">
            我的广播
          </h1>
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
            inert={page !== 0}
            className="h-full w-1/2 overflow-hidden"
          >
            <RadioHome onBrowse={() => goToPage(1)} />
          </section>

          <section
            aria-label="全部电台"
            aria-hidden={page !== 1}
            inert={page !== 1}
            className="no-scrollbar h-full w-1/2 overflow-y-auto px-4 pb-24 pt-4 sm:px-6"
          >
            <div className="mx-auto w-full max-w-6xl">
              <HomeBrowser initialItems={initialItems} initialError={initialError} />
              {dataSource}
            </div>
          </section>
        </div>
      </div>

      {/* 正在播放栏：仅在浏览页且有播放记录时显示 */}
      {page === 1 && <NowPlayingBar onGoHome={() => goToPage(0)} />}

      <ToastHost />
    </div>
  );
}
