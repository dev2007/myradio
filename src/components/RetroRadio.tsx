"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Station } from "@/types/station";
import { usePlayer } from "@/lib/player-context";
import { useFavorites } from "@/lib/favorites-context";

function fauxFrequency(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return 88 + (h % 200) / 10;
}

interface RetroRadioProps {
  station: Station | null;
  isPlaying: boolean;
  isLoading: boolean;
  onToggle: () => void;
  listTab: "favorites" | "history";
  onListTabChange: (tab: "favorites" | "history") => void;
  channels: Station[];
  onChannelSelect: (station: Station) => void;
  onRandom: () => void;
  randomLoading: boolean;
  /** 睡眠定时剩余秒数；null 表示未启用 */
  sleepRemaining: number | null;
  /** 待确认的定时时长（分钟） */
  sleepPending: number | null;
  /** 按压睡眠键：循环切换时长/取消 */
  onPressSleepTimer: () => void;
}

const BANDS = ["FM", "AM", "SW"] as const;

/** 音量旋钮：每 1% 音量对应 3° 旋转，转满 300° 即 100（顺时针加大，到顶不再转） */
const DEG_PER_PERCENT = 3;

/** 调台旋钮：每转动 30° 才切换一个频道（大阻尼，一格一格精准切换，一圈最多 12 个台） */
const CHANNEL_STEP_DEG = 30;

/** 液晶屏频道列表视窗：行高 20px，可视约 6 行，选中项保持在视窗内 */
const LCD_ROW_H = 20;
const LCD_VISIBLE = 6;

const FREQ_MIN = 88;
const FREQ_MAX = 108;
/** 刻度线：每 2MHz 一条，共 11 条 */
const FREQ_TICKS = Array.from({ length: 11 }, (_, i) => FREQ_MIN + i * 2);

/** 频谱条数量（喇叭均衡器 5 条 + 迷你波形图 5 条） */
const VIZ_BARS = 5;
/** 频谱分析取低频段前 16 个 bin（人耳敏感区，映射更明显） */
const VIZ_BINS = 16;
/** 频谱条静止幅度与最大幅度 */
const VIZ_MIN = 0.15;
const VIZ_MAX = 0.85;

/**
 * 播放中用 AnalyserNode 实时频谱驱动两组条形（喇叭均衡器 + 迷你波形图）。
 * analyser 为 null（CORS 失败降级/图形库未运行）时关闭 viz-real，走 CSS 伪律动。
 */
function useSpectrum(
  isPlaying: boolean,
  getAnalyser: () => AnalyserNode | null
): {
  machineRef: React.RefObject<HTMLDivElement | null>;
  setBar: (index: number) => (el: HTMLSpanElement | null) => void;
} {
  const machineRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const barRefs = refs.current;
    const root = machineRef.current;
    const analyser = isPlaying ? getAnalyser() : null;
    // 真实频谱可用与否通过根元素 class 同步到外部系统（CSS 据此启用/禁用伪律动）
    root?.classList.toggle("viz-real", analyser !== null);
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const smooth = new Array<number>(VIZ_BARS * 2).fill(VIZ_MIN);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < VIZ_BARS * 2; i++) {
        // 两组条共用同一频段映射（喇叭均衡器与波形图同步律动）
        const band = i % VIZ_BARS;
        const start = Math.floor((band / VIZ_BARS) * VIZ_BINS) + 1;
        const end = Math.max(start + 2, Math.floor(((band + 1) / VIZ_BARS) * VIZ_BINS) + 1);
        let sum = 0;
        for (let j = start; j < end && j < data.length; j++) sum += data[j];
        const v = sum / ((end - start) * 255);
        smooth[i] = smooth[i] * 0.7 + v * 0.3;
        const el = barRefs[i];
        if (el) el.style.transform = `scaleY(${(VIZ_MIN + smooth[i] * VIZ_MAX).toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      root?.classList.remove("viz-real");
      // 停止时清掉内联样式，交还 CSS 基础形态
      for (const el of barRefs) {
        if (el) el.style.transform = "";
      }
    };
  }, [isPlaying, getAnalyser]);

  const setBar = useCallback(
    (index: number) => (el: HTMLSpanElement | null) => {
      refs.current[index] = el;
    },
    []
  );

  return { machineRef, setBar };
}



export function RetroRadio({
  station,
  isPlaying,
  isLoading,
  onToggle,
  listTab,
  onListTabChange,
  channels,
  onChannelSelect,
  onRandom,
  randomLoading,
  sleepRemaining,
  sleepPending,
  onPressSleepTimer,
}: RetroRadioProps) {
  const { volume, setVolume, getAnalyser } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();
  const favActive = station ? isFavorite(station.uuid) : false;
  const volPercent = Math.round(volume * 100);
  const { machineRef, setBar } = useSpectrum(isPlaying, getAnalyser);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const tuningRef = useRef<HTMLDivElement | null>(null);
  const tuningDragRef = useRef<number | null>(null);
  /** 调台棘轮模型：detent 为虚拟档位计数，pos 为连续累积角度；
   *  每跨过一档恰好切换一个频道，到列表尽头即机械止点（不再积攒死行程） */
  const tuningDetentRef = useRef(0);
  const tuningPosRef = useRef(0);
  const [tuningAngle, setTuningAngle] = useState(0);
  const dragRef = useRef<{ lastAngle: number; volume: number } | null>(null);

  const sleepActive = sleepRemaining !== null;
  const sleepPendingActive = sleepPending !== null;
  /** 液晶屏顶部显示的睡眠时间：待确认档位（未开始）或进行中的倒计时 */
  const sleepText =
    sleepPending !== null
      ? `${sleepPending}:00`
      : sleepRemaining !== null
        ? `${Math.floor(sleepRemaining / 60)}:${String(sleepRemaining % 60).padStart(2, "0")}`
        : null;

  const pointerAngle = useCallback(
    (el: HTMLElement | null, clientX: number, clientY: number): number => {
      const rect = el?.getBoundingClientRect();
      if (!rect) return 0;
      return (
        (Math.atan2(clientY - (rect.top + rect.height / 2), clientX - (rect.left + rect.width / 2)) *
          180) /
        Math.PI
      );
    },
    []
  );

  const onKnobPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = knobRef.current;
      if (!el) return;
      // 鼠标仅响应左键，避免右键/中键误触发
      if (e.pointerType === "mouse" && e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        lastAngle: pointerAngle(el, e.clientX, e.clientY),
        volume: volPercent,
      };
    },
    [pointerAngle, volPercent]
  );

  const onKnobPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // 鼠标键已松开但 pointerup 丢失（如拖出窗口）时终止拖拽，防止悬停误改音量
      if (e.pointerType === "mouse" && e.buttons === 0) {
        dragRef.current = null;
        return;
      }
      const angle = pointerAngle(knobRef.current, e.clientX, e.clientY);
      let delta = angle - drag.lastAngle;
      delta = ((delta + 540) % 360) - 180; // 归一化到 [-180, 180]
      drag.lastAngle = angle;
      // 增量累积：只算相对上一次的角度，快速拖动/跨象限不会跳变
      // 屏幕坐标 y 轴向下，atan2 角度顺时针方向为正，直接累加即顺时针=加大音量
      const next = Math.min(Math.max(drag.volume + delta / DEG_PER_PERCENT, 0), 100);
      if (next !== drag.volume) {
        drag.volume = next;
        setVolume(next / 100);
      }
    },
    [pointerAngle, setVolume]
  );

  const onKnobKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        setVolume(Math.min(volPercent + step, 100) / 100);
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        setVolume(Math.max(volPercent - step, 0) / 100);
      }
    },
    [setVolume, volPercent]
  );

  /** 向 dir 方向转一档：直接切换到该频道并自动播放，到头返回 false（机械止点） */
  const turnDetents = useCallback(
    (dir: number): boolean => {
      if (channels.length === 0 || dir === 0) return false;
      const idx = channels.findIndex((s) => s.uuid === station?.uuid);
      // 当前台不在列表中时，任意方向的第一档先选中列表第一个频道
      const at = idx === -1 ? 0 : idx + dir;
      if (at < 0 || at >= channels.length) return false;
      onChannelSelect(channels[at]);
      return true;
    },
    [channels, station, onChannelSelect]
  );

  /** 松手/取消时结束拖拽（视觉始终吸附在档位上，无需再吸附） */
  const endTuningDrag = useCallback(() => {
    tuningDragRef.current = null;
  }, []);

  const onTuningPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = tuningRef.current;
      if (!el) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      tuningDragRef.current = pointerAngle(el, e.clientX, e.clientY);
    },
    [pointerAngle]
  );

  const onTuningPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (tuningDragRef.current === null) return;
      if (e.pointerType === "mouse" && e.buttons === 0) {
        endTuningDrag();
        return;
      }
      const angle = pointerAngle(tuningRef.current, e.clientX, e.clientY);
      let delta = angle - tuningDragRef.current;
      delta = ((delta + 540) % 360) - 180;
      tuningDragRef.current = angle;
      // 连续累积角度，换算目标档位；每跨过一档切换并播放一次频道
      tuningPosRef.current += delta;
      const target = Math.round(tuningPosRef.current / CHANNEL_STEP_DEG);
      const want = target - tuningDetentRef.current;
      if (want === 0) return;
      const dir = want > 0 ? 1 : -1;
      const idx = channels.findIndex((s) => s.uuid === station?.uuid);
      // 允许推进的档数受列表范围限制（电台不在列表时只能先跳到第一个）
      const allowed = Math.min(
        Math.abs(want),
        idx === -1 ? 1 : dir > 0 ? channels.length - 1 - idx : idx
      );
      if (allowed > 0) {
        // 一次事件内跨多档只切换一次，落到最终档位对应的频道
        onChannelSelect(channels[idx === -1 ? 0 : idx + dir * allowed]);
        tuningDetentRef.current += dir * allowed;
      }
      // 完成切换或到达限位后，虚拟位置都回到当前档位（机械止点，不积攒死行程）
      tuningPosRef.current = tuningDetentRef.current * CHANNEL_STEP_DEG;
      setTuningAngle(tuningDetentRef.current * CHANNEL_STEP_DEG);
    },
    [pointerAngle, channels, station, onChannelSelect, endTuningDrag]
  );

  const onTuningKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const dir =
        e.key === "ArrowUp" || e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowDown" || e.key === "ArrowLeft"
            ? -1
            : 0;
      if (dir === 0) return;
      e.preventDefault();
      if (turnDetents(dir)) {
        tuningDetentRef.current += dir;
        setTuningAngle(tuningDetentRef.current * CHANNEL_STEP_DEG);
      }
    },
    [turnDetents]
  );

  const knobRotation = volPercent * DEG_PER_PERCENT;
  const channelIndex = channels.findIndex((s) => s.uuid === station?.uuid);
  const freq = station ? fauxFrequency(station.name) : 98.5;
  // 列表滚动偏移：选中项尽量保持在视窗中部，越界钳制
  const listOffset =
    Math.min(Math.max(channelIndex - 2, 0), Math.max(channels.length - LCD_VISIBLE, 0)) *
    LCD_ROW_H;

  return (
    <div
      ref={machineRef}
      className={`radio-machine relative mx-auto w-full select-none pt-30 ${isPlaying ? "radio-playing" : ""}`}
    >
      {/* 天线（左上，播放时摆动）：与顶部夹角小、细长，顶部向机身内侧倾斜避免超出页面 */}
      <div
        aria-hidden="true"
        className="antenna absolute -top-12 left-8 z-0 h-50 w-1 origin-bottom-left rotate-[45deg] rounded-full bg-gradient-to-t from-[var(--radio-body-2)] via-[var(--radio-knob-1)] to-[var(--radio-body-1)]"
      >
        <span className="absolute -top-1.5 -left-[3px] h-2.5 w-2.5 rounded-full bg-[var(--radio-knob-1)]" />
      </div>

      {/* 机身（红色） */}
      <div className="machine-body relative aspect-[16/9] w-full rounded-[1.75rem] border border-black/25 bg-gradient-to-b from-[var(--radio-body-1)] to-[var(--radio-body-2)] px-3 pb-[18px] pt-[18px] pr-14 @max-[560px]:pr-3 shadow-2xl">
        {/* 顶部/底部防滑条纹 */}
        <div
          aria-hidden="true"
          className="absolute inset-x-8 top-1.5 h-2 rounded-sm"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) 3px, transparent 3px, transparent 9px)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-8 bottom-1.5 h-2 rounded-sm"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) 3px, transparent 3px, transparent 9px)",
          }}
        />

        {/* 主体：左喇叭网罩 + 右液晶屏/控制排（紧凑模式改纵向单列，网罩隐藏） */}
        <div className="flex h-full gap-3 pt-2 @max-[560px]:flex-col @max-[560px]:gap-2">
          {/* 左：点阵喇叭网罩 */}
          <div className="machine-grille relative flex w-[42%] flex-col overflow-hidden rounded-xl bg-[var(--radio-grille)] @max-[560px]:hidden">
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(rgba(0,0,0,0.5) 1.2px, transparent 1.2px)",
                backgroundSize: "7px 7px",
              }}
            />
            <div
              aria-hidden="true"
              className="machine-eq absolute inset-x-0 bottom-0 flex h-2/5 items-end justify-center gap-2 pb-8"
            >
              <span ref={setBar(0)} />
              <span ref={setBar(1)} className="eq-2" />
              <span ref={setBar(2)} className="eq-3" />
              <span ref={setBar(3)} className="eq-2" />
              <span ref={setBar(4)} />
            </div>
            <span
              aria-hidden="true"
              className="relative z-10 mx-auto mb-2 mt-auto rounded-full bg-black/50 px-3 py-0.5 text-[10px] font-bold tracking-widest text-white/80"
            >
              RADIO
            </span>
          </div>

          {/* 右：液晶屏 + 控制排（紧凑模式右缩进让位给调台旋钮，两行右缘共用同一边界） */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 @max-[560px]:pr-7">
            {/* 液晶屏行：紧凑模式下右侧是睡眠/随机正面按钮列 */}
            <div className="flex min-h-0 min-w-0 flex-1 gap-2">
              <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg bg-[var(--radio-screen)] px-2.5 py-2">
              {/* 频段头（随选中点亮）+ 睡眠时间（待确认闪烁，开始后稳定倒计时）+ 音量读数 */}
              <div className="flex items-center justify-between text-[10px] font-bold tracking-wider">
                <span className="flex items-center gap-2">
                  <span className="flex gap-2">
                    {BANDS.map((b) => (
                      <span key={b} className={b === "FM" ? "text-white/95" : "text-white/40"}>
                        {b}
                      </span>
                    ))}
                  </span>
                  {sleepText && (
                    <span
                      aria-hidden="true"
                      className={`flex items-center gap-1 font-mono text-[11px] font-bold text-[var(--color-accent)] ${
                        sleepPendingActive
                          ? "sleep-blink"
                          : "[text-shadow:0_0_6px_rgba(45,212,191,0.45)]"
                      }`}
                    >
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
                      </svg>
                      {sleepText}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <svg
                    aria-hidden="true"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-[var(--color-accent)]"
                  >
                    <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                    <path d="M19 5a9 9 0 0 1 0 14" />
                  </svg>
                  <span className="font-mono text-[11px] text-[var(--color-accent)]">
                    {volPercent}
                  </span>
                  {Array.from({ length: 6 }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full transition-colors duration-150 ${
                        i < Math.round((volPercent / 100) * 6)
                          ? "bg-[var(--color-accent)]"
                          : "bg-white/25"
                      }`}
                    />
                  ))}
                </span>
              </div>

              {/* 调频刻度 + 指针 */}
              <div className="relative mt-1.5 h-2 shrink-0 rounded-full bg-white/10" aria-hidden="true">
                {FREQ_TICKS.map((t) => (
                  <span
                    key={t}
                    className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/30"
                    style={{ left: `${((t - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * 100}%` }}
                  />
                ))}
                <span
                  className="absolute top-1/2 left-0 h-4 w-full transition-transform duration-500"
                  style={{
                    transform: `translateY(-50%) translateX(${((freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * 100}%)`,
                  }}
                >
                  <span className="absolute top-0 left-0 -ml-[1.5px] h-full w-[3px] rounded-full bg-danger" />
                </span>
              </div>
              <div
                className="mt-0.5 flex shrink-0 items-center justify-between text-[9px] text-white/35"
                aria-hidden="true"
              >
                <span>{FREQ_MIN}</span>
                <span className="font-mono text-[11px] font-bold text-[var(--color-accent)]">
                  {freq.toFixed(1)} MHz
                </span>
                <span>{FREQ_MAX}</span>
              </div>

              {/* 频道列表视窗（调台旋钮驱动选中项，绿字高亮当前台） */}
              <div className="mt-1 min-h-0 flex-1 overflow-hidden" aria-hidden="true">
                {channels.length === 0 ? (
                  <p className="px-0.5 text-[10px] leading-[18px] text-white/35">
                    {listTab === "favorites" ? "暂无收藏电台" : "暂无播放记录"}
                  </p>
                ) : (
                  <div
                    className="transition-transform duration-200"
                    style={{ transform: `translateY(-${listOffset}px)` }}
                  >
                    {channels.map((s, i) => {
                      const selected = i === channelIndex;
                      return (
                        <div
                          key={s.uuid}
                          className={`flex items-center gap-1.5 whitespace-nowrap text-[12px] leading-[20px] ${
                            selected ? "font-bold text-[var(--color-success)]" : "text-white/55"
                          }`}
                        >
                          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-white/30">
                            {i + 1}
                          </span>
                          <span className="truncate">
                            {selected ? "▶ " : ""}
                            {s.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>

              {/* 紧凑模式：睡眠/随机正面按钮（竖排列靠左，避开右缘旋钮区） */}
              <div className="hidden w-10 shrink-0 flex-col justify-center gap-2 @max-[560px]:flex">
                <button
                  type="button"
                  onClick={onPressSleepTimer}
                  aria-label={
                    sleepPendingActive
                      ? `睡眠定时已选 ${sleepPending} 分钟，5 秒后开始，继续按压切换`
                      : sleepActive
                        ? `睡眠定时剩余 ${sleepText}，按压重新选择`
                        : "按压设置睡眠定时，到时自动暂停"
                  }
                  className="relative flex min-h-8 flex-1 items-center justify-center rounded-md bg-black/30 text-white/70 shadow-inner transition-[background-color,box-shadow] duration-150 after:absolute after:-inset-2 after:rounded-md after:content-[''] hover:bg-black/40 hover:text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onRandom}
                  disabled={randomLoading}
                  aria-busy={randomLoading}
                  aria-label="随机播放一个频道"
                  className="relative flex min-h-8 flex-1 items-center justify-center rounded-md bg-black/30 text-white/70 shadow-inner transition-[background-color,box-shadow] duration-150 after:absolute after:-inset-2 after:rounded-md after:content-[''] hover:bg-black/40 hover:text-white/85 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <svg
                    aria-hidden="true"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22" />
                    <path d="m18 2 4 4-4 4" />
                    <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
                    <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
                    <path d="m18 14 4 4-4 4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 控制排：电源（播放/暂停）+ 收藏当前频道 + 收藏/历史列表切换（与下方 tab 同步） */}
            <div className="flex items-center gap-2.5 @max-[560px]:gap-2">
              {/* 紧凑模式：迷你波形图（VU 表，播放时律动） */}
              <div
                aria-hidden="true"
                className="compact-wave hidden h-9 shrink-0 items-end gap-1 rounded-md bg-black/35 px-2 py-1.5 @max-[560px]:flex"
              >
                <span ref={setBar(5)} style={{ height: "45%" }} />
                <span ref={setBar(6)} className="wave-2" style={{ height: "75%" }} />
                <span ref={setBar(7)} className="wave-3" style={{ height: "100%" }} />
                <span ref={setBar(8)} className="wave-2" style={{ height: "60%" }} />
                <span ref={setBar(9)} style={{ height: "85%" }} />
              </div>
              <button
                type="button"
                onClick={onToggle}
                disabled={!station}
                aria-label={
                  station
                    ? isPlaying
                      ? `暂停 ${station.name}`
                      : `播放 ${station.name}`
                    : "暂无播放中的电台"
                }
                className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#f6f1e7] to-[#d8cfbf] text-[var(--radio-body-2)] shadow-lg shadow-black/30 ring-2 ring-black/20 transition-transform duration-150 hover:scale-[1.04] active:scale-95 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  isLoading ? "power-loading" : ""
                }`}
              >
                {isPlaying ? (
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="3" y="2" width="3.5" height="12" rx="1" />
                    <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 2.5v11a1 1 0 0 0 1.53.85l8.6-5.5a1 1 0 0 0 0-1.7l-8.6-5.5A1 1 0 0 0 4 2.5z" />
                  </svg>
                )}
              </button>
              <span aria-hidden="true" className="led h-2 w-2 rounded-full @max-[560px]:hidden" />
              <button
                type="button"
                onClick={() => station && toggleFavorite(station)}
                disabled={!station}
                aria-pressed={station ? favActive : undefined}
                aria-label={
                  station
                    ? favActive
                      ? `取消收藏 ${station.name}`
                      : `收藏 ${station.name}`
                    : "暂无播放中的电台"
                }
                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow-inner transition-[background-color,box-shadow] duration-150 after:absolute after:-inset-2 after:rounded-md after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  favActive
                    ? "bg-black/45 text-danger shadow-[0_0_10px_rgba(248,113,113,0.55)]"
                    : "bg-black/30 text-white/60 hover:bg-black/40 hover:text-white/85"
                }`}
              >
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill={favActive ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z" />
                </svg>
              </button>
              {/* 弹性空隙对称拆分：收藏/历史居中于剩余空间，避免单侧大空档 */}
              <span className="min-w-2 flex-1 @max-[560px]:hidden" aria-hidden="true" />
              {(["favorites", "history"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onListTabChange(t)}
                  aria-pressed={listTab === t}
                  aria-label={t === "favorites" ? "切换到我的收藏列表" : "切换到历史播放列表"}
                  className={`relative flex h-7 w-20 items-center justify-center rounded-md text-[10px] font-bold shadow-inner transition-[background-color,box-shadow] duration-150 after:absolute after:inset-x-0 after:-inset-y-2 after:rounded-md after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent @max-[560px]:h-8 @max-[560px]:w-auto @max-[560px]:min-w-10 @max-[560px]:flex-1 ${
                    listTab === t
                      ? "bg-gradient-to-b from-[#e8e6e1] to-[#a8a49c] text-[var(--radio-body-2)] shadow-[0_0_12px_rgba(255,255,255,0.55)]"
                      : "bg-black/30 text-white/60 hover:bg-black/40 hover:text-white/80"
                  }`}
                >
                  {t === "favorites" ? "收藏" : "历史"}
                </button>
              ))}
              <span className="min-w-2 flex-1 @max-[560px]:hidden" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* 右缘上：音量旋钮（拖拽/触摸旋转，顺时针加大，100 时不再转） */}
        <div
          ref={knobRef}
          role="slider"
          tabIndex={0}
          aria-label="音量旋钮"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={volPercent}
          aria-valuetext={`${volPercent}%`}
          onPointerDown={onKnobPointerDown}
          onPointerMove={onKnobPointerMove}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onKeyDown={onKnobKeyDown}
          className="knob-ticks machine-knob machine-knob-top absolute z-20 cursor-grab touch-none rounded-full p-[4px] shadow-lg ring-2 ring-black/30 after:absolute after:-inset-2.5 after:rounded-full after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
          style={{ transform: `rotate(${knobRotation}deg)` }}
        >
          <span className="relative block h-full w-full rounded-full bg-gradient-to-b from-[var(--radio-knob-1)] to-[var(--radio-knob-2)]">
            <span className="absolute left-1/2 top-0.5 h-3 w-0.5 -translate-x-1/2 rounded-full bg-white/85" />
          </span>
        </div>

        {/* 右缘下：调台旋钮（无指针线；跟随手指旋转，每 30° 一格切换频道，松手吸附档位） */}
        <div
          ref={tuningRef}
          role="slider"
          tabIndex={0}
          aria-label={`调台旋钮：切换${listTab === "favorites" ? "收藏" : "历史"}列表频道`}
          aria-valuemin={0}
          aria-valuemax={Math.max(channels.length - 1, 0)}
          aria-valuenow={Math.max(channelIndex, 0)}
          aria-valuetext={station?.name}
          onPointerDown={onTuningPointerDown}
          onPointerMove={onTuningPointerMove}
          onPointerUp={endTuningDrag}
          onPointerCancel={endTuningDrag}
          onKeyDown={onTuningKeyDown}
          className="knob-ticks machine-knob machine-knob-bottom absolute z-20 cursor-grab touch-none rounded-full p-[4px] shadow-lg ring-2 ring-black/30 transition-transform duration-150 after:absolute after:-inset-2.5 after:rounded-full after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
          style={{ transform: `rotate(${tuningAngle}deg)` }}
        >
          <span className="block h-full w-full rounded-full bg-gradient-to-b from-[var(--radio-knob-1)] to-[var(--radio-knob-2)]" />
        </div>

        {/* 右缘中：随机播放侧键（实体按键质感，按压时向左按入机身，从全部频道随机挑一个播放） */}
        <button
          type="button"
          onClick={onRandom}
          disabled={randomLoading}
          aria-busy={randomLoading}
          aria-label="随机播放一个频道"
          className="machine-key-random absolute -right-3 top-1/2 z-20 flex w-4 origin-left -translate-y-1/2 items-center justify-center rounded-r-md bg-gradient-to-b from-[var(--radio-knob-1)] to-[var(--radio-knob-2)] shadow-md ring-1 ring-black/30 transition-[translate,scale,box-shadow] duration-150 hover:brightness-105 active:scale-x-[0.7] active:shadow-sm disabled:opacity-60 after:absolute after:-inset-x-4 after:-inset-y-2 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent @max-[560px]:hidden"
        >
          <svg
            aria-hidden="true"
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
            >
            <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22" />
            <path d="m18 2 4 4-4 4" />
            <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
            <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
            <path d="m18 14 4 4-4 4" />
          </svg>
        </button>

        {/* 右缘上：睡眠定时按压侧键（随机键上方；按压循环切换档位，液晶屏顶部显示状态） */}
        <button
          type="button"
          onClick={onPressSleepTimer}
          aria-label={
            sleepPendingActive
              ? `睡眠定时已选 ${sleepPending} 分钟，5 秒后开始，继续按压切换`
              : sleepActive
                ? `睡眠定时剩余 ${sleepText}，按压重新选择`
                : "按压设置睡眠定时，到时自动暂停"
          }
          className={`machine-key-sleep absolute -right-3 z-20 flex w-4 origin-left -translate-y-1/2 items-center justify-center rounded-r-md bg-gradient-to-b from-[var(--radio-knob-1)] to-[var(--radio-knob-2)] shadow-md ring-1 ring-black/30 transition-[translate,scale,box-shadow] duration-150 after:absolute after:-inset-x-4 after:-inset-y-2 after:content-[''] active:scale-x-[0.7] active:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent @max-[560px]:hidden ${
            sleepActive || sleepPendingActive
              ? "shadow-[0_0_10px_rgba(45,212,191,0.55)]"
              : "hover:brightness-105"
          }`}
        >
          <svg
            aria-hidden="true"
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
