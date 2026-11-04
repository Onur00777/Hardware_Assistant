"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useWorkbench } from "@/context/WorkbenchContext";
import { zipWaveforms } from "@/lib/engineering/capacitance";
import { Equation, Metric, NumberField, Panel, TinyButton, Warnings, cn } from "@/components/ui";

function uF(farads: number): string {
  const value = farads * 1e6;
  if (!Number.isFinite(value)) return "—";
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function mOhm(ohms: number): string {
  if (!Number.isFinite(ohms)) return "—";
  return (ohms * 1000).toFixed(2);
}

function ChartTip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-[#0c1118] px-3 py-2 text-xs">
      <p className="font-mono text-slate-400">{Number(label).toFixed(0)} µs</p>
      {payload.map((item) => (
        <p key={String(item.dataKey)} className="font-mono" style={{ color: item.color }}>
          {item.dataKey === "vRecommended" ? "Network" : "Boundary"} {Number(item.value).toFixed(3)} V
        </p>
      ))}
    </div>
  );
}

export function CapStudio() {
  const { project, capacitance, setCapacitance } = useWorkbench();
  const [mounted, setMounted] = useState(false);
  const input = project.capacitance;
  const wave = useMemo(() => zipWaveforms(capacitance), [capacitance]);
  useEffect(() => setMounted(true), []);

  const yValues = wave.flatMap((point) => [point.vBoundary, point.vRecommended ?? point.vBoundary]);
  const yMin = Math.min(capacitance.vBrownout, ...yValues, capacitance.vNom) - 0.05;
  const yMax = Math.max(capacitance.vNom, ...yValues) + 0.08;

  const lines = capacitance.valid
    ? [
        `ΔV = ${input.dropMv.toFixed(0)} mV,  I_peak = ${input.iPeak.toFixed(3)} A,  t_burst = ${input.burstUs.toFixed(0)} µs,  t_response = ${input.responseUs.toFixed(0)} µs`,
        `ESR_max = ${input.esrFraction.toFixed(2)} · ΔV / I_peak = ${mOhm(capacitance.esrMaxOhm)} mΩ`,
        `i_reg slews toward the load at I_peak / t_response`,
        `i_C = i_load − i_reg`,
        `v(t) = V_nom − ESR·i_C(t) − (1/C) ∫ i_C dt`,
        `C_min is searched until the simulated minimum equals ${(capacitance.vBrownout).toFixed(3)} V`,
        `C_min = ${uF(capacitance.cMinF)} µF,  Q at the minimum = ${(capacitance.qAtMinC * 1e6).toFixed(1)} µC`,
        capacitance.recommended
          ? `Recommended ${capacitance.recommended.description}: C_eff ${uF(capacitance.recommended.cEffectiveF)} µF, ESR ${mOhm(capacitance.recommended.esrOhm)} mΩ`
          : "No catalog combination meets both limits."
      ]
    : ["The transient is not solvable with these inputs."];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <Panel eyebrow="LTE / GSM burst" title="Hold-up inputs">
          <TinyButton
            tone="cyan"
            onClick={() => {
              const burst = [...project.loads].filter((load) => load.mode === "burst").sort((a, b) => b.currentMa - a.currentMa)[0];
              if (!burst) return;
              const rail = project.rails.find((item) => item.id === burst.railId);
              setCapacitance({
                vNom: rail?.voltage ?? input.vNom,
                iPeak: Math.round(burst.currentMa) / 1000
              });
            }}
          >
            Load the largest burst from the power tree
          </TinyButton>
          <div className="mt-4 grid gap-4">
            <NumberField accent="#06b6d4" label="Nominal rail" unit="V" value={input.vNom} min={1} max={24} step={0.01} onChange={(vNom) => setCapacitance({ vNom })} />
            <NumberField accent="#06b6d4" label="Allowed droop" unit="mV" value={input.dropMv} min={20} max={1000} step={1} onChange={(dropMv) => setCapacitance({ dropMv })} />
            <NumberField accent="#06b6d4" label="Peak burst current" unit="A" value={input.iPeak} min={0.1} max={8} step={0.01} hint="Treated as a step from the pre-burst current. The capacitor sees the whole step until the loop slews." onChange={(iPeak) => setCapacitance({ iPeak })} />
            <NumberField accent="#06b6d4" label="Burst duration" unit="µs" value={input.burstUs} min={50} max={5000} step={1} onChange={(burstUs) => setCapacitance({ burstUs })} />
            <div className="flex gap-2">
              <TinyButton tone="cyan" onClick={() => setCapacitance({ burstUs: 577 })}>
                GSM slot 577 µs
              </TinyButton>
              <TinyButton tone="cyan" onClick={() => setCapacitance({ burstUs: 1000 })}>
                1 ms burst
              </TinyButton>
            </div>
            <NumberField accent="#06b6d4" label="DC-DC response" unit="µs" value={input.responseUs} min={1} max={2000} step={1} hint="Time for the regulator current to slew across the step. Slower than the burst means the capacitor carries the pulse." onChange={(responseUs) => setCapacitance({ responseUs })} />
            <NumberField accent="#06b6d4" label="Droop fraction assigned to ESR" unit="" value={input.esrFraction} min={0.1} max={0.6} step={0.01} onChange={(esrFraction) => setCapacitance({ esrFraction })} />
            <NumberField accent="#06b6d4" label="MLCC capacitance remaining" unit="" value={input.mlccRetention} min={0.2} max={0.9} step={0.01} hint="DC-bias retention. 0.50 is a conservative X7R figure near half the rated voltage. Polymers stay at 95%." onChange={(mlccRetention) => setCapacitance({ mlccRetention })} />
          </div>
        </Panel>
      </div>

      <div className="space-y-4 xl:col-span-7">
        <Panel eyebrow="Required bank" title="Capacitance and ESR">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Metric label="Minimum C" value={capacitance.valid ? uF(capacitance.cMinF) : "—"} unit="µF" tone="cyan" detail="Effective farads, after bias" />
            <Metric label="Maximum ESR" value={capacitance.valid ? mOhm(capacitance.esrMaxOhm) : "—"} unit="mΩ" tone="cyan" />
            <Metric label="Brownout" value={capacitance.valid ? capacitance.vBrownout.toFixed(3) : "—"} unit="V" tone={capacitance.recommendedSim && capacitance.recommendedSim.vMin >= capacitance.vBrownout - 0.002 ? "emerald" : "red"} />
          </div>
          <div className="mt-4 grid gap-2">
            {capacitance.alternatives.map((combo, index) => (
              <article key={combo.description} className={cn("rounded-lg border px-3 py-3", index === 0 ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/[0.08]")}>
                <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300/80">{index === 0 ? "Recommended layout" : "Alternative"}</p>
                <p className="mt-1 text-sm text-slate-100">{combo.description}</p>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  C_eff {uF(combo.cEffectiveF)} µF · ESR {mOhm(combo.esrOhm)} mΩ
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  {combo.biasNote}{" "}
                  {combo.mlccCount > 0
                    ? "Put the ceramics on the same side as the modem pin, with the return via straight into the ground plane."
                    : "This bulk part meets the energy and ESR limits; still place MLCCs at the pin for the high-frequency edge."}{" "}
                  {combo.polymerCount > 0 ? "Keep the polymer on that same pin, not upstream of a thin trace." : ""}
                </p>
              </article>
            ))}
            {capacitance.valid && capacitance.alternatives.length === 0 ? (
              <p className="text-sm text-slate-300">The catalog cannot build this bank at {input.vNom.toFixed(2)} V. Cmin and ESRmax above are still the electrical requirement.</p>
            ) : null}
          </div>
        </Panel>

        <Panel eyebrow="V(t)" title="Droop against the brownout line">
          <div className="h-72 w-full">
            {mounted && wave.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={wave} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="tUs" tick={{ fill: "#8b97a8", fontSize: 11 }} tickFormatter={(value) => Number(value).toFixed(0)} unit=" µs" />
                  <YAxis domain={[yMin, yMax]} tick={{ fill: "#8b97a8", fontSize: 11 }} tickFormatter={(value) => Number(value).toFixed(2)} unit=" V" />
                  <Tooltip content={<ChartTip />} />
                  <ReferenceArea y1={capacitance.vBrownout} y2={yMax} fill="#10b981" fillOpacity={0.06} />
                  <ReferenceLine y={capacitance.vBrownout} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Brownout", fill: "#fca5a5", fontSize: 11 }} />
                  <ReferenceLine y={capacitance.vNom} stroke="#06b6d4" strokeDasharray="2 4" />
                  <Line type="linear" dataKey="vBoundary" stroke="#f59e0b" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line type="linear" dataKey="vRecommended" stroke="#06b6d4" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">Preparing the waveform…</div>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Amber is the sizing boundary (Cmin at ESRmax) and should touch the red brownout line. Cyan is the recommended network. The shaded band is the safe window. The step up at the end of the burst is the ESR voltage reversing as the regulator current recharges the capacitor.
          </p>
        </Panel>

        <Panel eyebrow="Audit" title="Plugged-in equations">
          <Equation lines={lines} />
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            577 µs is one GSM/GPRS transmit slot. A 12.5% duty in the power tree is that slot over the 4.615 ms frame. LTE CAT-1 bursts are often shorter than a GSM slot; the 1 ms button is the slower case. ESR figures in the catalog are typical 100 kHz values for combination search, not a substitute for the capacitor datasheet.
          </p>
        </Panel>
        <Warnings items={capacitance.warnings} />
      </div>
    </div>
  );
}
