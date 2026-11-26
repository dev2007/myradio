"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Station } from "@/types/station";
import { getFavorites, getHistory, recordHistory } from "@/lib/favorites-context";
import { toast } from "@/lib/toast";
import { bindGraph, getAnalyser, markVizFailed, vizAllowed } from "@/lib/visualizer";

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";

/** 睡眠定时可选时长（分钟），按压循环切换，末尾为「取消」 */
const SLEEP_STEPS: number[] = [15, 30, 45, 60];

/** 自动重试上限与间隔 */
const MAX_RETRY = 2;
const RETRY_DELAY = 1500;

interface PlayerContextValue {
  current: Station | null;
  state: PlayerState;
  error: string | null;
  volume: number;
  playStation: (station: Station) => void;
  toggle: () => void;
  setVolume: (value: number) => void;
  /** 睡眠定时剩余秒数；null 表示未启用 */
  sleepRemaining: number | null;
  /** 待确认的定时时长（分钟）：按压循环选择中，5 秒无按压即开始倒计时 */
  sleepPending: number | null;
  /** 按压睡眠键：在时长档位与取消之间循环切换 */
  pressSleepTimer: () => void;
  /** 在播放历史中前后导航播放（MediaSession/键盘快捷键共用） */
  playFromHistory: (direction: "prev" | "next") => void;
  /** 当前生效的 AnalyserNode；未走可视化元素或图形库未运行时为 null（调用方降级 CSS 律动） */
  getAnalyser: () => AnalyserNode | null;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer 必须在 PlayerProvider 内使用");
  }
  return ctx;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  /** 普通音频元素：任何电台都能播（无 CORS 要求），但接不了频谱 */
  const plainRef = useRef<HTMLAudioElement | null>(null);
  /** 可视化音频元素：恒带 crossOrigin=anonymous，支持 CORS 的电台走它 */
  const vizRef = useRef<HTMLAudioElement | null>(null);
  /** 当前生效元素；事件监听只响应生效元素的回调，避免切换时旧元素事件串扰 */
  const activeRef = useRef<"plain" | "viz">("plain");
  const [current, setCurrent] = useState<Station | null>(null);
  const currentRef = useRef<Station | null>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.9);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [sleepPending, setSleepPending] = useState<number | null>(null);
  const sleepPendingRef = useRef<number | null>(null);
  /** MediaSession 历史导航索引：当前播放的电台位于历史列表中的位置 */
  const historyNavRef = useRef(0);
  /** 播放序号：换台时递增，过期元素的错误回调据此放弃重试 */
  const seqRef = useRef(0);
  /** 自动重试状态：跟随最近一次播放的序号 */
  const retryRef = useRef({ seq: 0, count: 0, url: "" });

  const activeEl = useCallback(
    () => (activeRef.current === "viz" ? vizRef.current : plainRef.current),
    []
  );

  // 双音频元素单例：切换电台只换 src / 换元素，不重挂载，避免播放中断
  useEffect(() => {
    if (!plainRef.current) {
      const plain = new Audio();
      plain.preload = "none";
      plain.volume = 0.9;
      plainRef.current = plain;
    }
    if (!vizRef.current) {
      const viz = new Audio();
      viz.preload = "none";
      viz.volume = 0.9;
      vizRef.current = viz;
    }

    const isForActive = (e: Event) => e.target === activeEl();

    const onPlaying = (e: Event) => {
      if (!isForActive(e)) return;
      setState("playing");
      setError(null);
      retryRef.current.count = 0;
    };
    const onWaiting = (e: Event) => {
      if (isForActive(e)) setState("loading");
    };
    const onPause = (e: Event) => {
      if (!isForActive(e)) return;
      setState((prev) => (prev === "error" ? prev : "paused"));
    };
    const onError = (e: Event) => {
      if (!isForActive(e)) return;
      const info = retryRef.current;
      if (info.seq !== seqRef.current || !info.url) return;

      // 可视化元素加载失败（多为电台流不支持 CORS）：记入失败名单，换普通元素重播一次（静默，用户无需感知降级）
      if (activeRef.current === "viz") {
        markVizFailed(currentRef.current?.uuid ?? "");
        const plain = plainRef.current;
        if (!plain) return;
        plain.removeAttribute("crossorigin");
        activeRef.current = "plain";
        plain.src = info.url;
        void plain.play().catch(() => {});
        return;
      }

      // 自动重试（最多 2 次，间隔 1.5s），仍失败则给出换台建议
      if (info.count >= MAX_RETRY) {
        setState("error");
        setError("播放失败：该电台暂时连不上，可从播放历史或频道列表换个电台");
        toast("自动重试失败，已停止播放");
        return;
      }
      info.count += 1;
      setState("loading");
      toast(`连接中断，自动重试（${info.count}/${MAX_RETRY}）…`);
      window.setTimeout(() => {
        const el = activeEl();
        if (!el || retryRef.current.seq !== seqRef.current) return;
        el.src = info.url;
        void el.play().catch(() => {});
      }, RETRY_DELAY);
    };

    const elements = [plainRef.current, vizRef.current];
    for (const el of elements) {
      el.addEventListener("playing", onPlaying);
      el.addEventListener("waiting", onWaiting);
      el.addEventListener("pause", onPause);
      el.addEventListener("error", onError);
    }
    return () => {
      for (const el of elements) {
        el.removeEventListener("playing", onPlaying);
        el.removeEventListener("waiting", onWaiting);
        el.removeEventListener("pause", onPause);
        el.removeEventListener("error", onError);
      }
    };
  }, [activeEl]);

  const playStation = useCallback(
    (station: Station, options?: { record?: boolean }) => {
      const record = options?.record !== false;
      currentRef.current = station;
      setCurrent(station);
      setState("loading");
      setError(null);
      if (record) {
        recordHistory(station);
        // 正常播放总是回到历史最新一条，MediaSession 上/下一首导航索引归零
        historyNavRef.current = 0;
      }
      seqRef.current += 1;
      retryRef.current = { seq: seqRef.current, count: 0, url: station.streamUrl };

      // 按 CORS 失败名单选择元素：支持 CORS 的电台走可视化元素
      const useViz = vizAllowed(station.uuid) && typeof window.AudioContext === "function";
      const el = (useViz ? vizRef.current : plainRef.current) ?? plainRef.current;
      if (!el) return;
      const other = el === vizRef.current ? plainRef.current : vizRef.current;
      other?.pause();
      activeRef.current = el === vizRef.current ? "viz" : "plain";
      if (el === vizRef.current) {
        el.crossOrigin = "anonymous";
        bindGraph(el);
      }
      el.volume = volume;
      el.src = station.streamUrl;
      // 通知 AppShell：从浏览页发起播放时自动滑回首页
      window.dispatchEvent(new CustomEvent("radioo:play"));
      el.play().catch((err) => {
        // 换台打断旧加载属正常竞态，不当作错误
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
        setError("播放失败，该电台流可能已失效");
      });
    },
    [volume]
  );

  /** MediaSession 上一首/下一首：在播放历史中前后导航（导航播放不重写历史，
   *  用 historyNavRef 记住当前位于历史中的位置，正常播放时归零到最新） */
  const playFromHistory = useCallback(
    (direction: "prev" | "next") => {
      const history = getHistory();
      if (history.length === 0 || !current) return;
      const nav = historyNavRef.current;
      const idx =
        nav >= 0 && nav < history.length && history[nav]?.uuid === current.uuid
          ? nav
          : Math.max(history.findIndex((s) => s.uuid === current.uuid), 0);
      const target =
        direction === "prev"
          ? history[Math.min(idx + 1, history.length - 1)]
          : history[Math.max(idx - 1, 0)];
      if (!target || target.uuid === current.uuid) return;
      historyNavRef.current =
        direction === "prev"
          ? Math.min(idx + 1, history.length - 1)
          : Math.max(idx - 1, 0);
      playStation(target, { record: false });
    },
    [current, playStation]
  );

  // Media Session：锁屏/通知栏显示电台信息与控制按钮（含蓝牙耳机上一首/下一首）
  useEffect(() => {
    if (!current) return;
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({
        title: current.name,
        artist: [current.country, current.tags[0]].filter(Boolean).join(" · "),
        album: "我的广播",
        artwork: current.favicon
          ? [{ src: current.favicon, sizes: "96x96", type: "image/png" }]
          : [],
      });
      ms.setActionHandler("play", () => void activeEl()?.play().catch(() => {}));
      ms.setActionHandler("pause", () => activeEl()?.pause());
      ms.setActionHandler("previoustrack", () => playFromHistory("prev"));
      ms.setActionHandler("nexttrack", () => playFromHistory("next"));
    } catch {
      // MediaMetadata 不支持时静默降级
    }
  }, [current, playFromHistory, activeEl]);

  const toggle = useCallback(() => {
    const el = activeEl();
    if (!el || !current) return;
    if (el.paused) {
      if (!el.src) el.src = current.streamUrl;
      // 继续播放时重置自动重试计数，让断流重试重新可用
      retryRef.current = { seq: seqRef.current, count: 0, url: current.streamUrl };
      setState("loading");
      window.dispatchEvent(new CustomEvent("radioo:play"));
      el.play().catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
        setError("播放失败，该电台流可能已失效");
      });
    } else {
      el.pause();
    }
  }, [current, activeEl]);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1);
    setVolumeState(clamped);
    for (const el of [plainRef.current, vizRef.current]) {
      if (el) el.volume = clamped;
    }
    try {
      localStorage.setItem("radioo-volume", String(clamped));
    } catch {
      // 存储不可用时静默
    }
  }, []);

  // 挂载后恢复持久化音量（rAF 异步恢复：规避 SSR 水合不一致，也不在 effect 内同步 setState）
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem("radioo-volume");
        if (raw === null) return;
        const v = Number.parseFloat(raw);
        if (Number.isNaN(v)) return;
        const clamped = Math.min(Math.max(v, 0), 1);
        setVolumeState(clamped);
        for (const el of [plainRef.current, vizRef.current]) {
          if (el) el.volume = clamped;
        }
      } catch {
        // 存储不可用时静默
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // 首次进入：收藏列表有数据时预选第一个频道（暂停态、不自动播放，等用户按播放键）。
  // 带 ?station= 分享参数进入时不预选，让分享链接的自动播放正常生效
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (currentRef.current) return;
        if (new URLSearchParams(window.location.search).has("station")) return;
        const favorites = getFavorites();
        if (favorites.length === 0) return;
        currentRef.current = favorites[0];
        setCurrent(favorites[0]);
        setState("paused");
      } catch {
        // 存储不可用时静默
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  /** 按压睡眠键：15→30→45→60→取消 循环；5 秒内不再按压即按当前档位开始倒计时 */
  const pressSleepTimer = useCallback(() => {
    const prev = sleepPendingRef.current;
    let next: number | null;
    if (prev === null) {
      next = SLEEP_STEPS[0];
    } else {
      const idx = SLEEP_STEPS.indexOf(prev);
      next = idx === SLEEP_STEPS.length - 1 ? null : SLEEP_STEPS[idx + 1];
    }
    sleepPendingRef.current = next;
    setSleepPending(next);
    // 循环走到「取消」：同时清除正在进行的倒计时
    if (next === null) {
      setSleepEndsAt(null);
      setSleepRemaining(null);
    }
  }, []);

  // 待确认档位 5 秒后生效开始倒计时；期间再次按压会重置该定时器
  useEffect(() => {
    if (sleepPending === null) return;
    const id = setTimeout(() => {
      const minutes = sleepPendingRef.current;
      sleepPendingRef.current = null;
      setSleepPending(null);
      if (minutes) {
        setSleepEndsAt(Date.now() + minutes * 60000);
        setSleepRemaining(minutes * 60);
      }
    }, 5000);
    return () => clearTimeout(id);
  }, [sleepPending]);

  // 睡眠定时每秒倒计时，到点暂停并清除
  useEffect(() => {
    if (sleepEndsAt === null) return;
    const id = setInterval(() => {
      const remain = Math.round((sleepEndsAt - Date.now()) / 1000);
      if (remain <= 0) {
        setSleepEndsAt(null);
        setSleepRemaining(null);
        activeEl()?.pause();
      } else {
        setSleepRemaining(remain);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sleepEndsAt, activeEl]);

  const getAnalyserCb = useCallback(
    () => (activeRef.current === "viz" ? getAnalyser() : null),
    []
  );

  const value = useMemo(
    () => ({
      current,
      state,
      error,
      volume,
      playStation,
      toggle,
      setVolume,
      sleepRemaining,
      sleepPending,
      pressSleepTimer,
      playFromHistory,
      getAnalyser: getAnalyserCb,
    }),
    [
      current,
      state,
      error,
      volume,
      playStation,
      toggle,
      setVolume,
      sleepRemaining,
      sleepPending,
      pressSleepTimer,
      playFromHistory,
      getAnalyserCb,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
