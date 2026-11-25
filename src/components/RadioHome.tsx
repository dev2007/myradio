"use client";

import { useCallback, useState } from "react";
import type { Station } from "@/types/station";
import { usePlayer } from "@/lib/player-context";
import { useFavorites, useHistory } from "@/lib/favorites-context";
import { RetroRadio } from "./RetroRadio";

interface RadioHomeProps {
  onBrowse: () => void;
}

export function RadioHome({ onBrowse }: RadioHomeProps) {
  const { current, state, error, playStation, toggle, sleepRemaining, sleepPending, pressSleepTimer } =
    usePlayer();
  const { favorites } = useFavorites();
  const { history } = useHistory();
  const [listTab, setListTab] = useState<"favorites" | "history">("favorites");
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);

  /** 随机播放：从全库随机挑一个电台直接播放（order=random 取若干个，取首个可播的）。
   *  由收音机右缘的随机播放侧键触发 */
  const playRandom = useCallback(async () => {
    if (randomLoading) return;
    setRandomLoading(true);
    setRandomError(null);
    try {
      // 上游对 order=random 有短时缓存（缓存窗内同一批结果），
      // 所以一次拉 50 个候选，在本地随机抽一个，保证每次点击都换台
      const res = await fetch(`/api/stations?order=random&limit=50&_=${Date.now()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: Station[] };
      // 排除当前正在播的台，确保频道一定变化
      const candidates = data.items.filter((s) => s.uuid !== current?.uuid);
      if (candidates.length === 0) throw new Error();
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      playStation(pick);
    } catch {
      setRandomError("没挑到电台，再试一次吧");
    } finally {
      setRandomLoading(false);
    }
  }, [playStation, randomLoading, current]);

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
    <div className="mx-auto flex h-full w-full flex-col items-center justify-center gap-4 px-4">
      <div className="w-full shrink-0">
        <RetroRadio
          station={current}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onToggle={toggle}
          listTab={listTab}
          onListTabChange={setListTab}
          channels={listTab === "favorites" ? favorites : history}
          onChannelSelect={playStation}
          onRandom={() => void playRandom()}
          randomLoading={randomLoading}
          sleepRemaining={sleepRemaining}
          sleepPending={sleepPending}
          onPressSleepTimer={pressSleepTimer}
        />
      </div>

      {/* 信息区预留固定高度（覆盖浏览按钮/状态/错误各状态的最大高度），
          避免播放状态切换时内容高度变化导致居中布局里收音机上下跳动 */}
      <div className="flex min-h-[68px] shrink-0 flex-col items-center justify-center gap-1 text-center">
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
        {randomError && (
          <p role="alert" className="text-xs text-danger">
            {randomError}
          </p>
        )}
        {!current && (
          <button
            type="button"
            onClick={onBrowse}
            className="mt-1 flex min-h-[44px] w-full max-w-xs items-center justify-center gap-2 rounded-full border border-primary/40 bg-surface px-6 text-sm font-semibold text-primary-light transition-colors hover:bg-surface-2 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true">📡</span> 选择一个电台开始收听
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5L10.5 8L6 12.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
