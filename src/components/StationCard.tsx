"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Station } from "@/types/station";
import { usePlayer } from "@/lib/player-context";
import { useFavorites } from "@/lib/favorites-context";

/** ISO 3166-1 alpha-2 转国旗 emoji，无效码回退电台图标 */
function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "📡";
  const base = 0x1f1e6;
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    base + upper.charCodeAt(0) - 65,
    base + upper.charCodeAt(1) - 65
  );
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function EqualizerBars() {
  return (
    <span className="eq-bars" aria-hidden="true">
      <span className="eq-bar" />
      <span className="eq-bar eq-bar-2" />
      <span className="eq-bar eq-bar-3" />
    </span>
  );
}

export function StationCard({ station }: { station: Station }) {
  const { current, state, playStation } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [faviconFailed, setFaviconFailed] = useState(false);
  const isCurrent = current?.uuid === station.uuid;
  const isPlaying = isCurrent && state === "playing";
  const isLoading = isCurrent && state === "loading";
  const fav = isFavorite(station.uuid);
  const [favPop, setFavPop] = useState(false);
  const prevFav = useRef(fav);

  // 仅在「未收藏 → 已收藏」变化时播放一次弹跳，页面初始加载不触发
  useEffect(() => {
    const wasFav = prevFav.current;
    prevFav.current = fav;
    if (fav && !wasFav) {
      setFavPop(true);
      const timer = setTimeout(() => setFavPop(false), 400);
      return () => clearTimeout(timer);
    }
  }, [fav]);

  const [shareCopied, setShareCopied] = useState(false);

  /** 分享电台：优先系统分享面板，否则复制 ?station=uuid 链接（打开链接会自动播放） */
  const shareStation = useCallback(async () => {
    const url = `${window.location.origin}/?station=${station.uuid}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: station.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // 用户取消分享面板或剪贴板不可用：静默处理
    }
  }, [station.uuid, station.name]);

  return (
    <div
      className={`group relative flex min-h-[44px] w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-[background-color,border-color] duration-150 ${
        isCurrent
          ? "border-primary/70 bg-surface-2 ring-1 ring-primary/40"
          : "border-border bg-surface hover:border-primary/40 hover:bg-surface-2"
      }`}
    >
      {/* 覆盖全卡的透明播放按钮（心形按钮 z-index 更高不受影响） */}
      <button
        type="button"
        onClick={() => playStation(station)}
        aria-label={`播放电台 ${station.name}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      />

      <div className="flex items-center gap-3 pr-12">
        {station.favicon && !faviconFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/favicon?url=${encodeURIComponent(station.favicon)}`}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFaviconFailed(true)}
            className="h-11 w-11 shrink-0 rounded-xl bg-surface-2 object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 text-lg font-bold text-text"
          >
            {station.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-text">
              {station.name}
            </span>
            {isPlaying && <EqualizerBars />}
            {isLoading && (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent"
              />
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {countryFlag(station.countrycode)} {station.country || "未知地区"}
            {station.bitrate > 0 && ` · ${station.bitrate} kbps`}
            {station.hls && " · HLS"}
          </p>
        </div>
      </div>

      {station.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {station.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary-light"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span className="flex items-center">
          <button
            type="button"
            onClick={() => void shareStation()}
            aria-label={shareCopied ? "链接已复制" : `分享 ${station.name}`}
            title={shareCopied ? "链接已复制" : "分享电台"}
            className="relative -ml-1 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text after:absolute after:-inset-2 after:rounded-full after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {shareCopied ? (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15V4" />
                <path d="M8 7.5L12 3.5l4 4" />
                <path d="M5.5 11.5V19h13v-7.5" />
              </svg>
            )}
          </button>
          <span>{formatCount(station.clickcount)} 次收听</span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium transition-colors ${
            isPlaying
              ? "bg-success/15 text-success"
              : "bg-surface-2 text-text-muted group-hover:text-text"
          }`}
        >
          {isPlaying ? "播放中" : "点击播放"}
        </span>
      </div>

      {/* 心形收藏按钮 */}
      <button
        type="button"
        onClick={() => toggleFavorite(station)}
        aria-pressed={fav}
        aria-label={fav ? `取消收藏 ${station.name}` : `收藏 ${station.name}`}
        className={`absolute right-1.5 top-1.5 z-20 flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          fav ? "text-danger" : "text-text-muted hover:text-danger"
        } ${favPop ? "fav-pop" : ""}`}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={fav ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z" />
        </svg>
      </button>
    </div>
  );
}
