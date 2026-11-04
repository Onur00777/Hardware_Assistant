"use client";

import { useId, useState } from "react";
import { decimalsFromStep, formatEditable } from "@/lib/format";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Panel({
  eyebrow,
  title,
  action,
  children,
  className
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-white/[0.08] bg-[#0c1118]", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div>
          {eyebrow ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
          ) : null}
          <h2 className="text-sm font-medium text-slate-100">{title}</h2>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  unit,
  tone = "slate",
  detail
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "slate" | "amber" | "emerald" | "cyan" | "red" | "yellow";
  detail?: string;
}) {
  const toneClass = {
    slate: "text-slate-100",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    cyan: "text-cyan-400",
    red: "text-red-400",
    yellow: "text-yellow-300"
  }[tone];
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5">
      <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={cn("mt-1 font-mono text-xl tabular-nums leading-none", toneClass)}>
        {value}
        {unit ? <span className="ml-1 text-xs text-slate-500">{unit}</span> : null}
      </p>
      {detail ? <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  accent = "#f59e0b",
  hint
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accent?: string;
  hint?: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const digits = decimalsFromStep(step);
  const formatted = formatEditable(value, digits);
  const shown = focused ? draft : formatted;
  const ranged = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs text-slate-400">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id={id}
            inputMode="decimal"
            value={shown}
            onFocus={() => {
              setFocused(true);
              setDraft(formatted);
            }}
            onBlur={() => {
              const next = Number(draft);
              setFocused(false);
              if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
            }}
            onChange={(event) => {
              const raw = event.target.value;
              setDraft(raw);
              if (raw.trim() === "" || raw === "-" || raw.endsWith(".")) return;
              const next = Number(raw);
              if (!Number.isFinite(next) || next < min || next > max) return;
              onChange(next);
            }}
            className="w-[5.6rem] rounded-md border border-white/[0.08] bg-black/40 px-2 py-1 text-right font-mono text-sm tabular-nums text-slate-100 outline-none focus:border-white/30"
          />
          <span className="w-9 font-mono text-[10px] uppercase tracking-wide text-slate-500">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={ranged}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full"
        style={{ accentColor: accent }}
      />
      {hint ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-slate-400">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-white/[0.08] bg-black/40 px-2 py-2 text-sm text-slate-100 outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  accent = "amber",
  label
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  accent?: "amber" | "cyan";
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-white/[0.08] bg-black/30 p-0.5">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              active
                ? accent === "cyan"
                  ? "bg-cyan-400/15 text-cyan-200"
                  : "bg-amber-500/15 text-amber-200"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Equation({ lines }: { lines: string[] }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/35 p-3 font-mono text-[12px] leading-6 text-slate-300">
      {lines.join("\n")}
    </pre>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-100">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

export function Flag({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
      )}
    >
      {children}
    </span>
  );
}

export function TinyButton({
  children,
  onClick,
  disabled,
  tone = "slate"
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "slate" | "cyan" | "amber";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40",
        tone === "cyan" && "border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10",
        tone === "amber" && "border-amber-400/30 text-amber-200 hover:bg-amber-400/10",
        tone === "slate" && "border-white/10 text-slate-300 hover:bg-white/[0.04]"
      )}
    >
      {children}
    </button>
  );
}
