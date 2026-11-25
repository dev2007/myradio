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

interface PlayerContextValue {
  current: Station | null;
  state: PlayerState;
  error: string | null;
  volume: number;
  playStation: (station: Station) => void;
  toggle: () => void;
  setVolume: (value: number) => void;
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

  const value = useMemo(
    () => ({ current, state, error, volume, playStation, toggle, setVolume }),
    [current, state, error, volume, playStation, toggle, setVolume]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
