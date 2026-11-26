"use client";

import { useState } from "react";
import { usePlayer } from "@/lib/player-context";
import { EqualizerBars } from "./StationCard";

interface NowPlayingBarProps {
  /** 点击条身回到收音机页 */
  onGoHome: () => void;
}

/** 浏览页底部的正在播放栏：台名 + 播放状态 + 快捷播放/暂停 + 回到收音机 */
export function NowPlayingBar({ onGoHome }: NowPlayingBarProps) {
  const { current, state, toggle } = usePlayer();
  const [faviconFailed, setFaviconFailed] = useState(false);

  // 首页不需要（有收音机主体），无播放记录也不显示
  if (!current) return null;

  const isPlaying = state === "playing";
  const isLoading = state === "loading";
  const isError = state === "error";

  const statusText = isError
    ? "播放失败"
    : isLoading
      ? "正在连接…"
      : isPlaying
        ? "正在播放"
        : "已暂停";

  const dotClass = isError
    ? "bg-danger"
    : isLoading
      ? "bg-amber-500 animate-pulse"
      : isPlaying
        ? "bg-success animate-pulse"
        : "bg-text-muted/50";

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 sm:px-6">
        {/* 条身：回到收音机页 */}
        <button
          type="button"
          onClick={onGoHome}
          aria-label={`回到收音机页，当前 ${statusText} ${current.name}`}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {current.favicon && !faviconFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/favicon?url=${encodeURIComponent(current.favicon)}`}
              alt=""
              width={36}
              height={36}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFaviconFailed(true)}
              className="h-9 w-9 shrink-0 rounded-lg bg-surface-2 object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 text-sm font-bold text-text"
            >
              {current.name.slice(0, 1).toUpperCase()}
            </span>
          )}

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-text">{current.name}</span>
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
              {statusText}
              {isPlaying && <EqualizerBars />}
            </span>
          </span>
        </button>

        {/* 播放/暂停：不打断浏览 */}
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? `暂停 ${current.name}` : `播放 ${current.name}`}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-surface text-primary transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {isPlaying ? (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5v11a1 1 0 0 0 1.53.85l8.6-5.5a1 1 0 0 0 0-1.7l-8.6-5.5A1 1 0 0 0 4 2.5z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
