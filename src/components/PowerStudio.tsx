"use client";

import dynamic from "next/dynamic";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWorkbench } from "@/context/WorkbenchContext";
import { modeIncluded, parentChoices, SCENARIOS, SCENARIO_META, type Scenario } from "@/lib/engineering/power";
import { COPPER_1OZ_MILS } from "@/lib/engineering/ipc2152";
import { fmtA, fmtMm, fmtW } from "@/lib/format";
import type { LoadMode, RailKind } from "@/lib/types";
import { Equation, Metric, NumberField, Panel, Segmented, TinyButton, Warnings } from "@/components/ui";

const PowerTreeCanvas = dynamic(() => import("@/components/PowerTreeCanvas").then((mod) => mod.PowerTreeCanvas), {
  ssr: false,
  loading: () => <div className="h-[680px] animate-pulse rounded-xl border border-white/10 bg-black/20" />
});

export function PowerStudio() {
  const {
    project,
    power,
    setTraceRise,
    updateRail,
    updateLoad,
    addRail,
    addLoad,
    deleteRail,
    deleteLoad,
    openTool,
    protection,
    regulator,
    capacitance,
    harness
  } = useWorkbench();
  const [scenario, setScenario] = useState<Scenario>("mission");
  const [railId, setRailId] = useState("glv");
  const [loadId, setLoadId] = useState("load-fan");
  const [railMessage, setRailMessage] = useState<string | null>(null);

  const selectedRail = power.rails.find((rail) => rail.id === railId) ?? power.rails[0];
  const selectedLoad = project.loads.find((load) => load.id === loadId) ?? project.loads[0];
  const scenarioReport = power.scenarios[scenario];
  const active = power.scenarios.active;
  const idle = power.scenarios.idle;
  const mission = power.scenarios.mission;
  const peak = power.scenarios.peak;

  const largest = project.loads
    .filter((load) => modeIncluded(load.mode, "active"))
    .map((load) => {
      const rail = project.rails.find((item) => item.id === load.railId);
      return { name: load.name, watts: ((rail?.voltage ?? 0) * Math.max(0, load.currentMa) * Math.min(100, Math.max(0, load.dutyPct))) / 1e5 };
    })
    .sort((a, b) => b.watts - a.watts)[0];

  const trace = power.sourceTrace;
  const parent = selectedRail ? power.rails.find((rail) => rail.id === selectedRail.parentId) : undefined;

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Power tree"
        title="Topology"
        action={
          <TinyButton onClick={addRail} disabled={project.rails.length >= 12} tone="amber">
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> Add rail
            </span>
          </TinyButton>
        }
      >
        <PowerTreeCanvas
          project={project}
          power={power}
          protection={protection}
          regulator={regulator}
          capacitance={capacitance}
          harness={harness}
          scenario={scenario}
          onOpen={openTool}
        />
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          The canvas is the board power architecture: 24 V feed, reverse-polarity and TVS guard, bucks, LDOs, then loads. Each node shows voltage, RMS current for {SCENARIO_META[scenario].label.toLowerCase()}, efficiency, and thermal status. Green is inside limits. Pulsing red is thermal shutdown, bulk voltage below brownout, or a TVS that cannot stand off or clamp inside the downstream absolute maximum. Click a node to open that calculator.
        </p>
      </Panel>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className="order-2 space-y-4 xl:order-1 xl:col-span-7">
          {selectedRail ? (
            <Panel eyebrow="Selected rail" title={selectedRail.name}>
              <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500" htmlFor="rail-pick">
                Rail
              </label>
              <select
                id="rail-pick"
                value={selectedRail.id}
                onChange={(event) => setRailId(event.target.value)}
                className="mt-1 w-full rounded-md border border-white/[0.08] bg-black/40 px-2 py-2 text-sm"
              >
                {project.rails.map((rail) => (
                  <option key={rail.id} value={rail.id}>
                    {rail.name}
                  </option>
                ))}
              </select>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs text-slate-400">
                  Name
                  <input
                    aria-label={`${selectedRail.name} name`}
                    value={selectedRail.name}
                    onChange={(event) => updateRail(selectedRail.id, { name: event.target.value })}
                    className="mt-1 w-full rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-sm text-slate-100"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Kind
                  <select
                    aria-label={`${selectedRail.name} kind`}
                    disabled={selectedRail.kind === "source"}
                    value={selectedRail.kind}
                    onChange={(event) => updateRail(selectedRail.id, { kind: event.target.value as RailKind })}
                    className="mt-1 w-full rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-sm disabled:opacity-60"
                  >
                    {selectedRail.kind === "source" ? <option value="source">source</option> : null}
                    <option value="buck">buck</option>
                    <option value="ldo">ldo</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-400">
                  Parent
                  <select
                    aria-label={`${selectedRail.name} parent`}
                    disabled={selectedRail.kind === "source"}
                    value={selectedRail.parentId ?? ""}
                    onChange={(event) => updateRail(selectedRail.id, { parentId: event.target.value })}
                    className="mt-1 w-full rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-sm disabled:opacity-60"
                  >
                    {selectedRail.kind === "source" ? <option value="">—</option> : null}
                    {parentChoices(project.rails, selectedRail.id).map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField
                  label="Rail voltage"
                  unit="V"
                  value={selectedRail.voltage}
                  min={0.5}
                  max={60}
                  step={0.01}
                  onChange={(voltage) => updateRail(selectedRail.id, { voltage })}
                />
                {selectedRail.kind === "buck" ? (
                  <NumberField
                    label="Efficiency, excluding Iq"
                    unit="%"
                    value={selectedRail.efficiencyPct}
                    min={50}
                    max={99}
                    step={0.1}
                    onChange={(efficiencyPct) => updateRail(selectedRail.id, { efficiencyPct })}
                  />
                ) : null}
                {selectedRail.kind === "source" ? (
                  <div className="flex gap-2 self-end">
                    <TinyButton tone="amber" onClick={() => updateRail(selectedRail.id, { voltage: 12 })}>
                      12 V
                    </TinyButton>
                    <TinyButton tone="amber" onClick={() => updateRail(selectedRail.id, { voltage: 24 })}>
                      24 V
                    </TinyButton>
                  </div>
                ) : (
                  <NumberField
                    label="Quiescent current from parent"
                    unit="mA"
                    value={selectedRail.iqMa}
                    min={0}
                    max={20}
                    step={0.01}
                    onChange={(iqMa) => updateRail(selectedRail.id, { iqMa })}
                  />
                )}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={selectedRail.kind === "source" || project.rails.some((item) => item.parentId === selectedRail.id)}
                  onClick={() => {
                    const removed = deleteRail(selectedRail.id);
                    setRailMessage(removed ? null : "Move child rails off this node before deleting it.");
                    if (removed) setRailId(project.rails.find((rail) => rail.kind === "source")?.id ?? "");
                  }}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"
                >
                  <Trash2 size={14} /> Delete rail
                </button>
                {railMessage ? <p className="text-xs text-amber-200">{railMessage}</p> : null}
              </div>
              <Equation
                lines={
                  selectedRail.kind === "source"
                    ? [
                        `Case: ${SCENARIO_META[scenario].label} — ${SCENARIO_META[scenario].detail}`,
                        `I_avg = ${selectedRail.out[scenario].iAvgA.toFixed(4)} A`,
                        `I_rms = √(I_avg² + Σ I²·D·(1−D)) = ${selectedRail.out[scenario].iRmsA.toFixed(4)} A`,
                        `I_peak = Σ I = ${selectedRail.out[scenario].iPeakA.toFixed(4)} A`,
                        `P = V·I_avg = ${selectedRail.voltage.toFixed(2)} · ${selectedRail.out[scenario].iAvgA.toFixed(4)} = ${selectedRail.pOutW[scenario].toFixed(4)} W`
                      ]
                    : selectedRail.kind === "ldo"
                      ? [
                          `I_out,avg = ${selectedRail.out[scenario].iAvgA.toFixed(4)} A    I_q = ${(selectedRail.iqMa / 1000).toFixed(6)} A`,
                          `I_in = I_out + I_q = ${selectedRail.drawn[scenario].iAvgA.toFixed(4)} A avg, ${selectedRail.drawn[scenario].iRmsA.toFixed(4)} A rms`,
                          `P_out = ${selectedRail.voltage.toFixed(2)} · ${selectedRail.out[scenario].iAvgA.toFixed(4)} = ${selectedRail.pOutW[scenario].toFixed(4)} W`,
                          `P_in = ${parent ? parent.voltage.toFixed(2) : "Vin"} · I_in = ${selectedRail.pInW[scenario].toFixed(4)} W`,
                          `P_loss = P_in − P_out = ${selectedRail.lossW[scenario].toFixed(4)} W`
                        ]
                      : [
                          `η = ${(Math.min(99, Math.max(50, selectedRail.efficiencyPct)) / 100).toFixed(4)}    k = Vout/(Vin·η) = ${selectedRail.referralK.toFixed(4)}`,
                          `I_in,avg = k·I_out,avg + I_q = ${selectedRail.drawn[scenario].iAvgA.toFixed(4)} A`,
                          `I_in,rms = √((k·I_out,rms)² + I_q² + 2·I_q·k·I_out,avg) = ${selectedRail.drawn[scenario].iRmsA.toFixed(4)} A`,
                          `P_out = ${selectedRail.pOutW[scenario].toFixed(4)} W`,
                          `P_in = P_out/η + Vin·I_q = ${selectedRail.pInW[scenario].toFixed(4)} W`,
                          `P_loss = ${selectedRail.lossW[scenario].toFixed(4)} W`
                        ]
                }
              />
            </Panel>
          ) : null}

          <Panel
            eyebrow="Loads"
            title="Attached loads"
            action={
              <TinyButton
                tone="amber"
                disabled={project.loads.length >= 40}
                onClick={() => {
                  const id = addLoad();
                  if (id) setLoadId(id);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <Plus size={14} /> Add load
                </span>
              </TinyButton>
            }
          >
            {selectedLoad ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  Load
                  <select
                    aria-label="Selected load"
                    value={selectedLoad.id}
                    onChange={(event) => setLoadId(event.target.value)}
                    className="mt-1 w-full rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-sm text-slate-100"
                  >
                    {project.loads.map((load) => (
                      <option key={load.id} value={load.id}>
                        {load.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  Name
                  <input
                    aria-label={`${selectedLoad.name} name`}
                    value={selectedLoad.name}
                    onChange={(event) => updateLoad(selectedLoad.id, { name: event.target.value })}
                    className="mt-1 w-full rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-sm text-slate-100"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Rail
                  <select
                    aria-label={`${selectedLoad.name} rail`}
                    value={selectedLoad.railId}
                    onChange={(event) => updateLoad(selectedLoad.id, { railId: event.target.value })}
                    className="mt-1 w-full rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-sm"
                  >
                    {project.rails.map((rail) => (
                      <option key={rail.id} value={rail.id}>
                        {rail.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-400">
                  Mode
                  <select
                    aria-label={`${selectedLoad.name} mode`}
                    value={selectedLoad.mode}
                    onChange={(event) => updateLoad(selectedLoad.id, { mode: event.target.value as LoadMode })}
                    className="mt-1 w-full rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-sm"
                  >
                    <option value="idle">Idle</option>
                    <option value="active">Active</option>
                    <option value="burst">Burst</option>
                  </select>
                </label>
                <NumberField
                  label={`${selectedLoad.name} current`}
                  unit="mA"
                  value={selectedLoad.currentMa}
                  min={0}
                  max={20000}
                  step={0.01}
                  onChange={(currentMa) => updateLoad(selectedLoad.id, { currentMa })}
                />
                <NumberField
                  label={`${selectedLoad.name} duty`}
                  unit="%"
                  value={selectedLoad.dutyPct}
                  min={0}
                  max={100}
                  step={0.1}
                  hint="Fraction of time this row draws its stated current."
                  onChange={(dutyPct) => updateLoad(selectedLoad.id, { dutyPct })}
                />
                <button
                  type="button"
                  onClick={() => {
                    deleteLoad(selectedLoad.id);
                    setLoadId(project.loads.find((load) => load.id !== selectedLoad.id)?.id ?? "");
                  }}
                  className="inline-flex items-center gap-1 self-end rounded px-2 py-1 text-xs text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 size={14} /> Delete load
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No loads on this board.</p>
            )}
          </Panel>
        </div>
      <div className="order-1 space-y-4 xl:order-2 xl:col-span-5">
        <Panel eyebrow="Live budget" title="System summary">
          <Segmented
            label="Operating case shown on the tree"
            value={scenario}
            onChange={setScenario}
            options={SCENARIOS.map((id) => ({ id, label: SCENARIO_META[id].label }))}
          />
          <p className="mt-2 text-[11px] text-slate-500">{SCENARIO_META[scenario].detail}. This case is drawing {fmtW(scenarioReport.inputPowerW)} W and {fmtA(scenarioReport.inputAvgA)} average from the source.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="Total active power" value={fmtW(active.inputPowerW)} unit="W" tone="amber" detail="Battery input, active rows only" />
            <Metric label="Idle power" value={fmtW(idle.inputPowerW)} unit="W" tone="emerald" detail="Battery input, idle rows only" />
            <Metric label="Mission average" value={fmtW(mission.inputPowerW)} unit="W" detail="Active plus burst duty" />
            <Metric label="Max peak current" value={peak.inputPeakA.toFixed(3)} unit="A" tone="amber" detail="Active and burst coincident" />
          </div>
          {largest ? (
            <p className="mt-3 text-[11px] text-slate-500">
              Largest active-row average is {largest.name} at {largest.watts.toFixed(2)} W on its own rail, before converter loss.
            </p>
          ) : null}
          <p className="mt-2 font-mono text-[11px] text-slate-400">
            Balance, {scenario}: input {scenarioReport.inputPowerW.toFixed(4)} W = loads {scenarioReport.loadPowerW.toFixed(4)} W + loss {scenarioReport.lossW.toFixed(4)} W
            {Math.abs(scenarioReport.balanceErrorW) < 1e-4 ? "" : ` (error ${scenarioReport.balanceErrorW.toExponential(1)} W)`}
          </p>
        </Panel>

        <Panel eyebrow="Protection" title="Input fuse">
          <p className="font-mono text-3xl tabular-nums text-amber-400">
            {power.fuse.ratingA} <span className="text-base text-slate-500">A</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Mini/ATO blade fuse. Mission RMS is {fmtA(power.fuse.iRmsA)}, so the 75% continuous rule asks for at least {power.fuse.minRatingA.toFixed(2)} A.
            This rating runs at {power.fuse.loadingPct.toFixed(0)}% of nameplate on that RMS. Coincident peak is {fmtA(power.fuse.iPeakA)}.
          </p>
          <Equation
            lines={[
              "Rating ≥ I_rms / 0.75",
              `I_rms = ${power.fuse.iRmsA.toFixed(4)} A`,
              `I_min = ${(power.fuse.iRmsA / 0.75).toFixed(4)} A`,
              `Next standard value = ${power.fuse.ratingA} A`,
              `Series: ${power.fuse.series.join(", ")} A`
            ]}
          />
        </Panel>

        <Panel eyebrow="IPC-2152 · 1 oz" title="Battery trace">
          <NumberField
            label="Allowed temperature rise"
            unit="°C"
            value={project.traceRiseC}
            min={5}
            max={40}
            step={1}
            hint="External conductor, still air, no adjacent plane. A plane runs cooler."
            onChange={setTraceRise}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric
              label="External width"
              value={fmtMm(trace.external.recommendedMm)}
              unit="mm"
              tone="amber"
              detail={`${trace.external.recommendedMil.toFixed(0)} mil · exact ${fmtMm(trace.external.exactMm)} mm`}
            />
            <Metric
              label="Internal width"
              value={fmtMm(trace.internal.recommendedMm)}
              unit="mm"
              detail={`${trace.internal.recommendedMil.toFixed(0)} mil · 1 oz inner`}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Sized on mission RMS of {fmtA(trace.currentA)}. At the rounded external width the rise is {trace.external.riseAtRecommendedC.toFixed(2)} °C
            {trace.external.fabMinGoverns ? ", and the 0.20 mm fabrication minimum governs." : "."}
            {trace.usePour ? " Above 5 mm, pour the net instead of routing a single neck." : ""}
          </p>
          <Equation
            lines={[
              "ΔT = 215.3 · I² · W^(−1.15) · Th^(−1)   external, Brooks & Adam / IPC-2152",
              `I = ${trace.currentA.toFixed(4)} A,  Th = ${COPPER_1OZ_MILS.toFixed(3)} mil (35 µm),  ΔT = ${project.traceRiseC.toFixed(0)} °C`,
              `W = (215.3 · I² / (ΔT · Th))^(1/1.15) = ${trace.external.exactMil.toFixed(1)} mil`,
              `Recommend ${trace.external.recommendedMm.toFixed(2)} mm external, ${trace.internal.recommendedMm.toFixed(2)} mm internal`
            ]}
          />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="font-mono uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="py-1 font-normal">Rail</th>
                  <th className="py-1 font-normal">Mission RMS</th>
                  <th className="py-1 font-normal">Ext mm</th>
                  <th className="py-1 font-normal">Loss W</th>
                </tr>
              </thead>
              <tbody>
                {power.rails.map((rail) => (
                  <tr key={rail.id} className="border-t border-white/[0.05] font-mono text-slate-300">
                    <td className="py-1 pr-2">{rail.name}</td>
                    <td className="py-1 pr-2">{fmtA(rail.out.mission.iRmsA)}</td>
                    <td className="py-1 pr-2">{fmtMm(rail.trace.external.recommendedMm)}</td>
                    <td className="py-1">{rail.lossW.mission.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Warnings items={power.warnings} />
        <p className="text-[11px] leading-relaxed text-slate-500">
          Idle, active, and burst rows are separate operating contributions. Active power ignores burst rows; mission power includes them at I·D. Peak turns active and burst fully on together. RMS treats pulses as uncorrelated, which is exact for one pulse and arithmetic for DC loads. An LDO reflects I_out + I_q. A buck reflects V_out·I_out/(V_in·η) + I_q with η held constant. Copper heating uses RMS because a 577 µs radio burst does not warm a trace; a fan that stays on for seconds does.
        </p>
      </div>
    </div>
    </div>
  );
}
