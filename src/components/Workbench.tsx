"use client";

import { Cable, Layers, RotateCcw, Shield, Thermometer, Unplug, Waves, Zap } from "lucide-react";
import { useState } from "react";
import { CapStudio } from "@/components/CapStudio";
import { CanStudio } from "@/components/CanStudio";
import { HarnessStudio } from "@/components/HarnessStudio";
import { PcbStudio } from "@/components/PcbStudio";
import { PowerStudio } from "@/components/PowerStudio";
import { ProtectionStudio } from "@/components/ProtectionStudio";
import { RegulatorStudio } from "@/components/RegulatorStudio";
import { cn } from "@/components/ui";
import { WorkbenchProvider, useWorkbench } from "@/context/WorkbenchContext";
import { fmtA, fmtTemp, fmtW } from "@/lib/format";

type ToolId = "power" | "thermal" | "bulk" | "can" | "protect" | "harness" | "pcb";

const TOOLS: { id: ToolId; label: string; detail: string; icon: typeof Zap }[] = [
  { id: "power", label: "Power tree", detail: "Budget", icon: Zap },
  { id: "thermal", label: "Regulator", detail: "Thermal", icon: Thermometer },
  { id: "bulk", label: "Bulk cap", detail: "Transient", icon: Waves },
  { id: "protect", label: "Protection", detail: "ISO 7637", icon: Shield },
  { id: "harness", label: "Harness", detail: "I²t", icon: Unplug },
  { id: "pcb", label: "PCB", detail: "Impedance", icon: Layers },
  { id: "can", label: "CAN bus", detail: "Physical", icon: Cable }
];

function toneForZone(id: string): "emerald" | "yellow" | "red" {
  if (id === "safe") return "emerald";
  if (id === "warning") return "yellow";
  return "red";
}

function Shell() {
  const { project, dirty, power, regulator, can, reset } = useWorkbench();
  const [tool, setTool] = useState<ToolId>("power");
  const zone = regulator.valid ? toneForZone(regulator.zone.id) : "red";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="border-b border-white/[0.08] bg-[#080a0f]/95 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="px-4 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Hardware</p>
          <p className="text-lg font-medium tracking-tight text-slate-100">
            Power<span className="text-amber-400">Studio</span>
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col" aria-label="Calculators">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            const active = tool === item.id;
            const accent = item.id === "bulk" || item.id === "can" || item.id === "protect" || item.id === "harness" || item.id === "pcb";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id)}
                className={cn(
                  "flex min-w-[9.5rem] items-center gap-2 rounded-lg border px-3 py-2 text-left lg:min-w-0",
                  active
                    ? accent
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                      : "border-amber-400/40 bg-amber-500/10 text-amber-100"
                    : "border-transparent text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"
                )}
              >
                <Icon size={16} />
                <span>
                  <span className="block text-sm">{item.label}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">{item.detail}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="border-b border-white/[0.08] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {dirty ? "Modified profile" : "Loaded preset"}
              </p>
              <h1 className="mt-1 max-w-3xl text-base font-medium leading-snug text-slate-100 sm:text-lg">{project.name}</h1>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.04]"
            >
              <RotateCcw size={13} />
              Reset preset
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <HeaderStat label="Active power" value={`${fmtW(power.scenarios.active.inputPowerW)} W`} tone="text-amber-400" />
            <HeaderStat label="Idle power" value={`${fmtW(power.scenarios.idle.inputPowerW)} W`} tone="text-emerald-400" />
            <HeaderStat label="Peak current" value={fmtA(power.scenarios.peak.inputPeakA)} tone="text-amber-400" />
            <HeaderStat
              label="Regulator Tj"
              value={regulator.valid ? `${fmtTemp(regulator.tj)} °C` : "—"}
              tone={zone === "emerald" ? "text-emerald-400" : zone === "yellow" ? "text-yellow-300" : "text-red-400"}
            />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            CAN {can.rows.find((row) => row.selected)?.limit.label ?? ""} · {can.timing.solvable ? `${(can.timing.samplePoint * 100).toFixed(1)}% sample` : "timing unsolved"} · fuse {power.fuse.ratingA} A
          </p>
        </header>
        <div className="px-4 py-4 sm:px-6">
          {tool === "power" ? <PowerStudio /> : null}
          {tool === "thermal" ? <RegulatorStudio /> : null}
          {tool === "bulk" ? <CapStudio /> : null}
          {tool === "protect" ? <ProtectionStudio /> : null}
          {tool === "harness" ? <HarnessStudio /> : null}
          {tool === "pcb" ? <PcbStudio /> : null}
          {tool === "can" ? <CanStudio /> : null}
        </div>
      </main>
    </div>
  );
}

function HeaderStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0c1118] px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={cn("mt-1 font-mono text-lg tabular-nums", tone)}>{value}</p>
    </div>
  );
}

export function Workbench() {
  return (
    <WorkbenchProvider>
      <Shell />
    </WorkbenchProvider>
  );
}
