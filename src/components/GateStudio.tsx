"use client";

import { useMemo, useState } from "react";
import { cn, Panel } from "@/components/ui";
import { useWorkbench } from "@/context/WorkbenchContext";
import { designGate, formatDesignGate, type GateStatus } from "@/lib/design-gate";

const TONE: Record<GateStatus, string> = {
  pass: "text-emerald-300",
  watch: "text-yellow-300",
  fail: "text-red-300"
};

const MARK: Record<GateStatus, string> = {
  pass: "Pass",
  watch: "Watch",
  fail: "Fail"
};

export function GateStudio() {
  const workbench = useWorkbench();
  const { project, openTool } = workbench;
  const gate = useMemo(
    () =>
      designGate({
        project,
        power: workbench.power,
        regulator: workbench.regulator,
        capacitance: workbench.capacitance,
        protection: workbench.protection,
        harness: workbench.harness,
        pcb: workbench.pcb,
        analog: workbench.analog,
        can: workbench.can
      }),
    [project, workbench.power, workbench.regulator, workbench.capacitance, workbench.protection, workbench.harness, workbench.pcb, workbench.analog, workbench.can]
  );
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const verdict = gate.status === "pass" ? "Release" : gate.status === "watch" ? "Watch" : "Hold";
  const visible = onlyOpen ? gate.checks.filter((item) => item.status !== "pass") : gate.checks;

  async function copyVerdict() {
    const text = formatDesignGate(gate, project.name);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Design gate"
        title={verdict}
        action={
          <button type="button" onClick={() => void copyVerdict()} className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.04]">
            {copied ? "Copied" : "Copy verdict"}
          </button>
        }
      >
        <p className={cn("font-mono text-4xl tabular-nums", TONE[gate.status])}>
          {gate.failed}
          <span className="ml-2 text-base text-slate-500">fail</span>
          <span className="ml-4 text-yellow-300">{gate.watching}</span>
          <span className="ml-2 text-base text-slate-500">watch</span>
          <span className="ml-4 text-emerald-300">{gate.passed}</span>
          <span className="ml-2 text-base text-slate-500">pass</span>
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          One release checklist for this board. A fail uses the same limit as the studio it comes from. Watch is still inside that limit. Open a row to change the number.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setOnlyOpen(false)}
            className={cn("rounded-md border px-3 py-1 text-xs", onlyOpen ? "border-white/10 text-slate-400" : "border-amber-400/40 text-amber-100")}
          >
            All {gate.checks.length}
          </button>
          <button
            type="button"
            onClick={() => setOnlyOpen(true)}
            className={cn("rounded-md border px-3 py-1 text-xs", onlyOpen ? "border-amber-400/40 text-amber-100" : "border-white/10 text-slate-400")}
          >
            Open items {gate.failed + gate.watching}
          </button>
        </div>
      </Panel>
      <div className="space-y-2">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openTool(item.tool)}
            className="flex w-full items-start justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0c1118] px-4 py-3 text-left hover:border-white/20"
          >
            <span>
              <span className="block text-sm text-slate-100">{item.label}</span>
              <span className="mt-1 block text-[12px] leading-relaxed text-slate-400">{item.detail}</span>
            </span>
            <span className={cn("shrink-0 font-mono text-[11px] uppercase tracking-[0.14em]", TONE[item.status])}>{MARK[item.status]}</span>
          </button>
        ))}
        {visible.length === 0 ? <p className="text-sm text-slate-500">Nothing open. This board is clear to release.</p> : null}
      </div>
    </div>
  );
}
