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
import { recordHistory } from "@/lib/favorites-context";

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";

/** 睡眠定时可选时长（分钟），按压循环切换，末尾为「取消」 */
const SLEEP_STEPS: number[] = [15, 30, 45, 60];

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Station | null>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.9);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [sleepPending, setSleepPending] = useState<number | null>(null);
  const sleepPendingRef = useRef<number | null>(null);

  // 单例 audio 元素：切换电台只换 src，不重挂载，避免播放中断
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "none";
      audio.volume = 0.9;
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => {
      setState("playing");
      setError(null);
    };
    const onWaiting = () => setState("loading");
    const onPause = () => setState((prev) => (prev === "error" ? prev : "paused"));
    const onError = () => {
      setState("error");
      setError("电台暂时不可用，请稍后再试或换一个电台");
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, []);

  // Media Session：锁屏/通知栏显示电台信息与控制按钮
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
      ms.setActionHandler("play", () => audioRef.current?.play());
      ms.setActionHandler("pause", () => audioRef.current?.pause());
    } catch {
      // MediaMetadata 不支持时静默降级
    }
  }, [current]);

  const playStation = useCallback((station: Station) => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrent(station);
    setState("loading");
    setError(null);
    recordHistory(station);
    audio.src = station.streamUrl;
    // 通知 AppShell：从浏览页发起播放时自动滑回首页
    window.dispatchEvent(new CustomEvent("radioo:play"));
    audio.play().catch(() => {
      setState("error");
      setError("播放失败，该电台流可能已失效");
    });
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      if (!audio.src) audio.src = current.streamUrl;
      setState("loading");
      window.dispatchEvent(new CustomEvent("radioo:play"));
      audio.play().catch(() => {
        setState("error");
        setError("播放失败，该电台流可能已失效");
      });
    } else {
      audio.pause();
    }
  }, [current]);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1);
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
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
        audioRef.current?.pause();
      } else {
        setSleepRemaining(remain);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sleepEndsAt]);

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
    }),
    [current, state, error, volume, playStation, toggle, setVolume, sleepRemaining, sleepPending, pressSleepTimer]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
