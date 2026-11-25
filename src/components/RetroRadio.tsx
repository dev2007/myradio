"use client";

import { useCallback, useRef, useState } from "react";
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
}

const BANDS = ["FM", "AM", "SW"] as const;

/** 音量旋钮：每 1% 音量对应 3° 旋转，转满 300° 即 100（顺时针加大，到顶不再转） */
const DEG_PER_PERCENT = 3;

/** 调台旋钮：每转动 30° 才切换一个频道（大阻尼，一格一格精准切换，一圈最多 12 个台） */
const CHANNEL_STEP_DEG = 30;

/** 液晶屏频道列表视窗：行高 18px，可视约 6 行，选中项保持在视窗内 */
const LCD_ROW_H = 18;
const LCD_VISIBLE = 6;

const FREQ_MIN = 88;
const FREQ_MAX = 108;
/** 刻度线：每 2MHz 一条，共 11 条 */
const FREQ_TICKS = Array.from({ length: 11 }, (_, i) => FREQ_MIN + i * 2);

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
}: RetroRadioProps) {
  const { volume, setVolume } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();
  const favActive = station ? isFavorite(station.uuid) : false;
  const volPercent = Math.round(volume * 100);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const tuningRef = useRef<HTMLDivElement | null>(null);
  const tuningDragRef = useRef<number | null>(null);
  const tuningAccRef = useRef(0);
  const tuningAngleRef = useRef(0);
  const [tuningAngle, setTuningAngle] = useState(0);
  const [tuningDragging, setTuningDragging] = useState(false);
  const dragRef = useRef<{ lastAngle: number; volume: number } | null>(null);

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

  /** 转动调台旋钮：在当前列表（收藏/历史）中按 offset 切换频道 */
  const selectChannel = useCallback(
    (offset: number) => {
      if (channels.length === 0 || offset === 0) return;
      const idx = channels.findIndex((s) => s.uuid === station?.uuid);
      // 当前电台不在列表中时，任意方向的第一格先选中列表第一个频道
      const next = idx === -1 ? 0 : idx + offset;
      if (next < 0 || next >= channels.length) return; // 已到头，不再切换
      onChannelSelect(channels[next]);
    },
    [channels, onChannelSelect, station]
  );

  /** 松手/取消时结束拖拽，并平滑吸附到最近档位（此时 transition 生效） */
  const endTuningDrag = useCallback(() => {
    tuningDragRef.current = null;
    setTuningDragging(false);
    const snapped = Math.round(tuningAngleRef.current / CHANNEL_STEP_DEG) * CHANNEL_STEP_DEG;
    tuningAngleRef.current = snapped;
    setTuningAngle(snapped);
    tuningAccRef.current = 0;
  }, []);

  const onTuningPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = tuningRef.current;
      if (!el) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      tuningAccRef.current = 0;
      tuningDragRef.current = pointerAngle(el, e.clientX, e.clientY);
      setTuningDragging(true);
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
      // 旋钮视觉角度跟随手指连续旋转（拖拽中无 transition，跟手不延迟）
      tuningAngleRef.current += delta;
      setTuningAngle(tuningAngleRef.current);
      // 大阻尼：角度累积，每满一格（30°）才切换一个频道，到头后不再切换
      tuningAccRef.current += delta;
      const steps = Math.floor(Math.abs(tuningAccRef.current) / CHANNEL_STEP_DEG);
      if (steps > 0) {
        const dir = tuningAccRef.current > 0 ? 1 : -1;
        tuningAccRef.current -= dir * steps * CHANNEL_STEP_DEG;
        selectChannel(dir * steps);
      }
    },
    [pointerAngle, selectChannel, endTuningDrag]
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
      tuningAngleRef.current += dir * CHANNEL_STEP_DEG;
      setTuningAngle(tuningAngleRef.current);
      selectChannel(dir);
    },
    [selectChannel]
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
      className={`radio-machine relative mx-auto w-full max-w-[min(100%,calc((100dvh_-_240px)*1.7778))] ${isPlaying ? "radio-playing" : ""}`}
    >
      {/* 天线（右上，播放时摆动） */}
      <div
        aria-hidden="true"
        className="antenna absolute -top-20 right-8 z-0 h-28 w-1 origin-bottom-left -rotate-[30deg] rounded-full bg-gradient-to-t from-[var(--radio-body-2)] via-[var(--radio-knob-1)] to-[var(--radio-body-1)]"
      >
        <span className="absolute -top-1.5 -left-[3px] h-2.5 w-2.5 rounded-full bg-[var(--radio-knob-1)]" />
      </div>

      {/* 机身（红色） */}
      <div className="relative mt-16 aspect-[16/9] w-full rounded-[1.75rem] border border-black/25 bg-gradient-to-b from-[var(--radio-body-1)] to-[var(--radio-body-2)] px-3 pb-[18px] pt-[18px] pr-11 shadow-2xl">
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

        {/* 主体：左喇叭网罩 + 右液晶屏/控制排 */}
        <div className="flex h-full gap-3 pt-2">
          {/* 左：点阵喇叭网罩 */}
          <div className="machine-grille relative flex w-[42%] flex-col overflow-hidden rounded-xl bg-[var(--radio-grille)]">
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
              className="machine-eq absolute inset-x-0 bottom-0 flex h-2/5 items-end justify-center gap-1.5 pb-2"
            >
              <span />
              <span className="eq-2" />
              <span className="eq-3" />
              <span className="eq-2" />
              <span />
            </div>
            <span
              aria-hidden="true"
              className="relative z-10 mx-auto mb-2 mt-auto rounded-full bg-black/50 px-3 py-0.5 text-[10px] font-bold tracking-widest text-white/80"
            >
              RADIO
            </span>
          </div>

          {/* 右：液晶屏 + 控制排 */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg bg-[var(--radio-screen)] px-2.5 py-2">
              {/* 频段头（随选中点亮）+ 音量读数（右上角，紧邻音量旋钮） */}
              <div className="flex items-center justify-between text-[9px] font-bold tracking-wider">
                <span className="flex gap-2">
                  {BANDS.map((b) => (
                    <span key={b} className={b === "FM" ? "text-white/95" : "text-white/40"}>
                      {b}
                    </span>
                  ))}
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
                  <span className="font-mono text-[10px] text-[var(--color-accent)]">
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
                className="mt-0.5 flex shrink-0 items-center justify-between text-[8px] text-white/35"
                aria-hidden="true"
              >
                <span>{FREQ_MIN}</span>
                <span className="font-mono text-[10px] font-bold text-[var(--color-accent)]">
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
                          className={`flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-[18px] ${
                            selected ? "font-bold text-[var(--color-success)]" : "text-white/55"
                          }`}
                        >
                          <span className="w-4 shrink-0 text-right font-mono text-[9px] text-white/30">
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

            {/* 控制排：电源（播放/暂停）+ 收藏当前频道 + 收藏/历史列表切换（与下方 tab 同步） */}
            <div className="flex items-center gap-2.5">
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
              <span aria-hidden="true" className="led h-2 w-2 rounded-full" />
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
              {(["favorites", "history"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onListTabChange(t)}
                  aria-pressed={listTab === t}
                  aria-label={t === "favorites" ? "切换到我的收藏列表" : "切换到历史播放列表"}
                  className={`relative flex h-7 flex-1 items-center justify-center rounded-md text-[10px] font-bold shadow-inner transition-[background-color,box-shadow] duration-150 after:absolute after:inset-x-0 after:-inset-y-2 after:rounded-md after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    listTab === t
                      ? "bg-gradient-to-b from-[#e8e6e1] to-[#a8a49c] text-[var(--radio-body-2)] shadow-[0_0_12px_rgba(255,255,255,0.55)]"
                      : "bg-black/30 text-white/60 hover:bg-black/40 hover:text-white/80"
                  }`}
                >
                  {t === "favorites" ? "收藏" : "历史"}
                </button>
              ))}
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
          className="knob-ticks absolute -right-4 top-7 z-20 h-14 w-14 cursor-grab touch-none rounded-full p-[4px] shadow-lg ring-2 ring-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
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
          className={`knob-ticks absolute -right-3 bottom-9 z-20 h-10 w-10 cursor-grab touch-none rounded-full p-[3px] shadow-lg ring-2 ring-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing ${
            tuningDragging ? "" : "transition-transform duration-200"
          }`}
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
          className="absolute -right-3 top-1/2 z-20 flex h-12 w-3 -translate-y-1/2 items-center justify-center rounded-r-md bg-gradient-to-b from-[var(--radio-knob-1)] to-[var(--radio-knob-2)] shadow-md ring-1 ring-black/30 transition-[translate,box-shadow] duration-150 hover:brightness-105 active:-translate-x-[3px] active:shadow-sm disabled:opacity-60 after:absolute after:-inset-x-4 after:-inset-y-2 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
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
            className="text-[var(--radio-body-2)]"
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
  );
}
