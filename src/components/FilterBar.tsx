"use client";

import { useEffect, useRef, useState } from "react";
import type { FilterOption } from "@/types/station";

interface DropdownProps {
  icon: string;
  placeholder: string;
  options: FilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

/** 自定义下拉筛选：role=listbox + aria + 键盘导航（↑↓/Home/End/Enter/Esc） */
function Dropdown({ icon, placeholder, options, value, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.focus();
      setActiveIndex(value ? options.findIndex((o) => o.value === value) : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const closeAndRefocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const select = (optionValue: string | null) => {
    onChange(optionValue);
    closeAndRefocus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeAndRefocus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < options.length) {
          const opt = options[activeIndex];
          select(opt.value === value ? null : opt.value);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${
          selected
            ? "border-primary/60 bg-primary/15 text-primary-light"
            : "border-border bg-surface text-text-muted hover:border-primary/40 hover:text-text"
        }`}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{selected ? selected.label : placeholder}</span>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={placeholder}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-72 w-56 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-xl shadow-black/20 outline-none"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => select(isSelected ? null : opt.value)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    i === activeIndex ? "bg-primary/10 text-text" : "text-text-muted"
                  } ${isSelected ? "text-primary-light" : ""}`}
                >
                  <span className="truncate">{opt.label}</span>
                  <span className="shrink-0 text-[11px] text-text-muted">
                    {isSelected ? "✓" : opt.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface FilterBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  countries: FilterOption[];
  languages: FilterOption[];
  tags: FilterOption[];
  country: string | null;
  language: string | null;
  tag: string | null;
  onCountryChange: (v: string | null) => void;
  onLanguageChange: (v: string | null) => void;
  onTagChange: (v: string | null) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

export function FilterBar(props: FilterBarProps) {
  const {
    query, onQueryChange, countries, languages, tags,
    country, language, tag,
    onCountryChange, onLanguageChange, onTagChange,
    onClearAll, hasActiveFilters,
  } = props;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
          🔍
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="搜索电台名称…"
          aria-label="搜索电台名称"
          className="h-11 w-full rounded-full border border-border bg-surface pl-11 pr-11 text-base text-text placeholder:text-text-muted focus:border-primary/60"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="清空搜索"
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-text/10 hover:text-text"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* 注意：不能用 overflow-x-auto 包裹下拉——overflow 裁剪会切掉绝对定位的下拉面板 */}
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown icon="🌍" placeholder="国家" options={countries} value={country} onChange={onCountryChange} />
        <Dropdown icon="🗣️" placeholder="语言" options={languages} value={language} onChange={onLanguageChange} />
        <Dropdown icon="🎵" placeholder="类型" options={tags} value={tag} onChange={onTagChange} />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="ml-auto min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium text-text-muted transition-colors hover:text-danger"
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
}
