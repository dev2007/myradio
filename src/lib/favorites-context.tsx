"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { Station } from "@/types/station";

const STORAGE_KEY = "radioo-favorites";
const EMPTY: Station[] = [];
const listeners = new Set<() => void>();
let cache: Station[] | null = null;

function readFromStorage(): Station[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Station[];
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): Station[] {
  if (cache === null) {
    cache = readFromStorage();
  }
  return cache;
}

function getServerSnapshot(): Station[] {
  return EMPTY;
}

function persist(list: Station[]) {
  cache = list;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 存储不可用（隐私模式/配额满）时仅会话内生效
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

interface FavoritesContextValue {
  favorites: Station[];
  isFavorite: (uuid: string) => boolean;
  toggleFavorite: (station: Station) => void;
  removeFavorite: (uuid: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites 必须在 FavoritesProvider 内使用");
  }
  return ctx;
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleFavorite = useCallback((station: Station) => {
    const current = getSnapshot();
    const exists = current.some((s) => s.uuid === station.uuid);
    persist(exists ? current.filter((s) => s.uuid !== station.uuid) : [station, ...current]);
  }, []);

  const removeFavorite = useCallback((uuid: string) => {
    persist(getSnapshot().filter((s) => s.uuid !== uuid));
  }, []);

  const isFavorite = useCallback(
    (uuid: string) => favorites.some((s) => s.uuid === uuid),
    [favorites]
  );

  const value = useMemo(
    () => ({ favorites, isFavorite, toggleFavorite, removeFavorite }),
    [favorites, isFavorite, toggleFavorite, removeFavorite]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

/* ---------------- 播放历史（与收藏同文件维护，存储键独立） ---------------- */

const HISTORY_KEY = "radioo-history";
const MAX_HISTORY = 50;
const historyListeners = new Set<() => void>();
let historyCache: Station[] | null = null;

function readHistoryFromStorage(): Station[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Station[];
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getHistorySnapshot(): Station[] {
  if (historyCache === null) {
    historyCache = readHistoryFromStorage();
  }
  return historyCache;
}

function persistHistory(list: Station[]) {
  historyCache = list;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // 存储不可用时仅会话内生效
  }
  historyListeners.forEach((l) => l());
}

function subscribeHistory(onChange: () => void) {
  historyListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    historyListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 记录一次播放：去重置顶（最新在最上面），上限 50 条 */
export function recordHistory(station: Station) {
  const current = getHistorySnapshot();
  const rest = current.filter((s) => s.uuid !== station.uuid);
  persistHistory([station, ...rest].slice(0, MAX_HISTORY));
}

/** 模块级读取播放历史（供无 Provider 依赖的模块使用，如 MediaSession 处理器） */
export function getHistory(): Station[] {
  return getHistorySnapshot();
}

/** 模块级读取收藏列表 */
export function getFavorites(): Station[] {
  return getSnapshot();
}

/** 删除单条播放历史 */
export function removeHistory(uuid: string): void {
  persistHistory(getHistorySnapshot().filter((s) => s.uuid !== uuid));
}

/** 清空播放历史 */
export function clearHistory(): void {
  persistHistory([]);
}

interface HistoryContextValue {
  history: Station[];
  removeHistory: (uuid: string) => void;
  clearHistory: () => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) {
    throw new Error("useHistory 必须在 HistoryProvider 内使用");
  }
  return ctx;
}

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const history = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getServerSnapshot);
  const value = useMemo(
    () => ({ history, removeHistory, clearHistory }),
    [history]
  );
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}
