"use client";

import { toast } from "@/lib/toast";
import type { Station } from "@/types/station";
import { usePlayer } from "@/lib/player-context";
import { useHistory } from "@/lib/favorites-context";

const MAX_CHIPS = 20;

/** 浏览页顶部的最近播放条：点击播放、单条删除、一键清空 */
export function HistoryStrip() {
  const { history, removeHistory, clearHistory } = useHistory();
  const { current, playStation } = usePlayer();

  if (history.length === 0) return null;

  const chips: Station[] = history.slice(0, MAX_CHIPS);

  return (
    <section aria-label="最近播放" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">最近播放</h2>
        <button
          type="button"
          onClick={() => {
            clearHistory();
            toast("已清空播放历史");
          }}
          className="relative min-h-[36px] rounded-full px-3 text-xs font-medium text-text-muted transition-colors after:absolute after:-inset-1 after:rounded-full after:content-[''] hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          清空
        </button>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {chips.map((s) => {
          const isCurrent = current?.uuid === s.uuid;
          return (
            <span
              key={s.uuid}
              className={`flex h-9 shrink-0 items-center gap-0.5 rounded-full border pl-3 pr-1 transition-colors ${
                isCurrent
                  ? "border-primary/60 bg-primary/15"
                  : "border-border bg-surface"
              }`}
            >
              <button
                type="button"
                onClick={() => playStation(s)}
                className="relative max-w-[160px] truncate text-xs font-medium text-text transition-colors after:absolute after:-inset-1 after:rounded-full after:content-[''] hover:text-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                aria-label={`播放 ${s.name}`}
                title={s.name}
              >
                {isCurrent ? "▶ " : ""}
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => removeHistory(s.uuid)}
                aria-label={`从最近播放中删除 ${s.name}`}
                className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors after:absolute after:-inset-1 after:rounded-full after:content-[''] hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}
