"use client";

import { useState } from "react";
import type { Station } from "@/types/station";
import { usePlayer } from "@/lib/player-context";
import { useFavorites, useHistory } from "@/lib/favorites-context";
import { RetroRadio } from "./RetroRadio";

function FavoriteRow({
  station,
  onPlay,
  onRemove,
}: {
  station: Station;
  onPlay: (s: Station) => void;
  onRemove?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-surface p-2 transition-colors hover:bg-surface-2">
      <button
        type="button"
        onClick={() => onPlay(station)}
        aria-label={`播放 ${station.name}`}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      />
      {station.favicon && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/favicon?url=${encodeURIComponent(station.favicon)}`}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-10 w-10 shrink-0 rounded-lg bg-surface-2 object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 text-sm font-bold text-text"
        >
          {station.name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{station.name}</p>
        <p className="truncate text-xs text-text-muted">
          {station.country || "未知地区"}
          {station.tags[0] && ` · ${station.tags[0]}`}
        </p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`取消收藏 ${station.name}`}
          className="absolute right-1 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/10"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z" />
          </svg>
        </button>
      )}
    </div>
  );
}

interface RadioHomeProps {
  onBrowse: () => void;
}

export function RadioHome({ onBrowse }: RadioHomeProps) {
  const { current, state, error, playStation, toggle } = usePlayer();
  const { favorites, removeFavorite } = useFavorites();
  const { history } = useHistory();
  const [listTab, setListTab] = useState<"favorites" | "history">("favorites");

  const isLoading = state === "loading";
  const isPlaying = state === "playing";

  const statusText = error
    ? error
    : isLoading
      ? "正在连接电台…"
      : isPlaying
        ? "正在播放"
        : current
          ? "已暂停"
          : null;

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col items-center gap-4 px-4 pt-4">
      <div className="w-full shrink-0">
        <RetroRadio
          station={current}
          isPlaying={isPlaying}
          onToggle={toggle}
          listTab={listTab}
          onListTabChange={setListTab}
          channels={listTab === "favorites" ? favorites : history}
          onChannelSelect={playStation}
        />
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1 text-center">
        {current && (
          <p className="text-sm text-text-muted">
            {current.country || "未知地区"}
            {current.tags[0] && ` · ${current.tags[0]}`}
            {current.bitrate > 0 && ` · ${current.bitrate} kbps`}
          </p>
        )}
        {statusText && (
          <p
            role={error ? "alert" : "status"}
            className={`text-xs ${error ? "text-danger" : "text-text-muted"}`}
          >
            {statusText}
          </p>
        )}
        {!current && (
          <button
            type="button"
            onClick={onBrowse}
            className="mt-1 flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-primary/40 bg-surface px-6 text-sm font-semibold text-primary-light transition-colors hover:bg-surface-2 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true">📡</span> 选择一个电台开始收听
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5L10.5 8L6 12.5" />
            </svg>
          </button>
        )}
      </div>

      <section
        className="flex min-h-0 w-full flex-1 flex-col"
        aria-label="我的收藏与历史播放"
      >
        <div
          role="tablist"
          aria-label="列表切换"
          className="mb-3 flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={listTab === "favorites"}
            onClick={() => setListTab("favorites")}
            className={`flex min-h-[36px] min-w-[44px] flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              listTab === "favorites"
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            我的收藏{favorites.length > 0 && ` (${favorites.length})`}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listTab === "history"}
            onClick={() => setListTab("history")}
            className={`flex min-h-[36px] min-w-[44px] flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              listTab === "history"
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            历史播放{history.length > 0 && ` (${history.length})`}
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-4">
        {listTab === "favorites" ? (
          favorites.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-text-muted">
              还没有收藏电台，去浏览页点卡片右上角的 ♥ 收藏吧
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {favorites.map((station) => (
                <FavoriteRow
                  key={station.uuid}
                  station={station}
                  onPlay={playStation}
                  onRemove={() => removeFavorite(station.uuid)}
                />
              ))}
            </div>
          )
        ) : history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-text-muted">
            还没有播放记录，去浏览页挑一个电台听听吧
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((station) => (
              <FavoriteRow key={station.uuid} station={station} onPlay={playStation} />
            ))}
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
