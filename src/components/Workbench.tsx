"use client";

import { Activity, Cable, FileDown, Layers, RotateCcw, Shield, Thermometer, Unplug, Waves, Zap } from "lucide-react";
import { useState } from "react";
import { AnalogStudio } from "@/components/AnalogStudio";
import { CapStudio } from "@/components/CapStudio";
import { CanStudio } from "@/components/CanStudio";
import { ExportStudio } from "@/components/ExportStudio";
import { HarnessStudio } from "@/components/HarnessStudio";
import { PcbStudio } from "@/components/PcbStudio";
import { PowerStudio } from "@/components/PowerStudio";
import { ProtectionStudio } from "@/components/ProtectionStudio";
import { RegulatorStudio } from "@/components/RegulatorStudio";
import { cn } from "@/components/ui";
import { WorkbenchProvider, useWorkbench } from "@/context/WorkbenchContext";
import { fmtTemp } from "@/lib/format";
import { BOARD_PRESETS, type BoardPresetId } from "@/lib/preset";

type ToolId = "power" | "thermal" | "bulk" | "can" | "protect" | "harness" | "pcb" | "analog" | "export";

const TOOLS: { id: ToolId; label: string; detail: string; icon: typeof Zap }[] = [
  { id: "power", label: "Power tree", detail: "Budget", icon: Zap },
  { id: "thermal", label: "Regulator", detail: "Thermal", icon: Thermometer },
  { id: "bulk", label: "Bulk cap", detail: "Transient", icon: Waves },
  { id: "protect", label: "Protection", detail: "ISO 7637", icon: Shield },
  { id: "harness", label: "Harness", detail: "I²t", icon: Unplug },
  { id: "pcb", label: "PCB", detail: "Impedance", icon: Layers },
  { id: "analog", label: "Analog", detail: "ADC / NTC", icon: Activity },
  { id: "export", label: "Export", detail: "SPICE / BOM", icon: FileDown },
  { id: "can", label: "CAN bus", detail: "Physical", icon: Cable }
];

function Shell() {
  const { project, dirty, presetId, loadPreset, regulator, can, protection, harness, capacitance, reset } = useWorkbench();
  const [tool, setTool] = useState<ToolId>("power");
  const steadyTj = Math.max(regulator.valid ? regulator.tj : 0, ...harness.channels.map((row) => row.tjC));
  const inrushTj = harness.channels.reduce((max, row) => Math.max(max, row.tjInrushC), 0);
  const inrushTrips = harness.channels.some((row) => row.part !== undefined && row.tjInrushC >= row.part.tsdC);
  const worstTj = inrushTrips ? Math.max(steadyTj, inrushTj) : steadyTj;
  const droopMv = capacitance.recommendedSim ? (capacitance.recommendedSim.vMin - capacitance.vBrownout) * 1e3 : -1;
  const glvOk = protection.tvs.clampOk && protection.tvs.standoffOk;
  const canOk = can.timing.solvable && Math.abs(can.timing.ppm) < 50;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="border-b border-white/[0.08] bg-[#080a0f]/95 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="px-4 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Hardware</p>
          <p className="text-lg font-medium tracking-tight text-slate-100">
            Power<span className="text-amber-400">Studio</span>
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-y-auto" aria-label="Calculators">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            const active = tool === item.id;
            const accent = item.id === "bulk" || item.id === "can" || item.id === "protect" || item.id === "analog";
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
            <div className="min-w-0 flex-1">
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500" htmlFor="board-preset">
                {dirty ? "Modified profile" : "Board preset"}
              </label>
              <select
                id="board-preset"
                value={presetId}
                onChange={(event) => loadPreset(event.target.value as BoardPresetId)}
                className="mt-1 w-full max-w-3xl rounded-md border border-white/[0.08] bg-black/40 px-2 py-2 text-sm text-slate-100"
              >
                {BOARD_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
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
          <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-5">
            <HeaderStat label="24V GLV Margin" value={`${protection.tvs.marginV.toFixed(1)} V`} tone={glvOk ? "text-emerald-400" : "text-red-400"} />
            <HeaderStat label="Worst-Case Junction Temp" value={`${fmtTemp(worstTj)} °C`} tone={worstTj < 100 && !inrushTrips ? "text-emerald-400" : worstTj < 115 && !inrushTrips ? "text-yellow-300" : "text-red-400"} />
            <HeaderStat label="LTE Droop Margin" value={droopMv < 0 ? "Fail" : `${droopMv.toFixed(0)} mV`} tone={droopMv >= 0 ? "text-cyan-300" : "text-red-400"} />
            <HeaderStat label="CAN Timing Error" value={can.timing.solvable ? `${can.timing.ppm.toFixed(0)} ppm` : "—"} tone={canOk ? "text-emerald-400" : "text-red-400"} />
            <HeaderStat label="Middlebrook Stability" value={protection.peakRatio.toFixed(3)} tone={protection.stable ? "text-emerald-400" : "text-red-400"} />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">{project.name}</p>
        </header>
        <div className="px-4 py-4 sm:px-6">
          {tool === "power" ? <PowerStudio /> : null}
          {tool === "thermal" ? <RegulatorStudio /> : null}
          {tool === "bulk" ? <CapStudio /> : null}
          {tool === "protect" ? <ProtectionStudio /> : null}
          {tool === "harness" ? <HarnessStudio /> : null}
          {tool === "pcb" ? <PcbStudio /> : null}
          {tool === "analog" ? <AnalogStudio /> : null}
          {tool === "export" ? <ExportStudio /> : null}
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
