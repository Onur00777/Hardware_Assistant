"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useWorkbench } from "@/context/WorkbenchContext";
import { modeIncluded, parentChoices, SCENARIOS, SCENARIO_META, type Scenario } from "@/lib/engineering/power";
import { COPPER_1OZ_MILS } from "@/lib/engineering/ipc2152";
import { fmtA, fmtMm, fmtW } from "@/lib/format";
import type { LoadMode, RailKind } from "@/lib/types";
import { Equation, Metric, NumberField, Panel, Segmented, TinyButton, Warnings, cn } from "@/components/ui";

function CellNumber({
  value,
  min,
  max,
  step,
  onChange,
  label
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <input
      aria-label={label}
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
      }}
      className="w-full min-w-[4.5rem] rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-right font-mono text-xs tabular-nums outline-none focus:border-amber-400/40"
    />
  );
}

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
    deleteLoad
  } = useWorkbench();
  const [scenario, setScenario] = useState<Scenario>("mission");
  const [railId, setRailId] = useState("glv");
  const [loadId, setLoadId] = useState("load-fan");
  const [railMessage, setRailMessage] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [wires, setWires] = useState<{ id: string; d: string }[]>([]);

  const selectedRail = power.rails.find((rail) => rail.id === railId) ?? power.rails[0];
  const selectedLoad = project.loads.find((load) => load.id === loadId) ?? project.loads[0];
  const scenarioReport = power.scenarios[scenario];
  const active = power.scenarios.active;
  const idle = power.scenarios.idle;
  const mission = power.scenarios.mission;
  const peak = power.scenarios.peak;

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const origin = wrap.getBoundingClientRect();
    const next: { id: string; d: string }[] = [];
    for (const rail of power.rails) {
      if (!rail.parentId) continue;
      const from = nodeRefs.current.get(rail.parentId);
      const to = nodeRefs.current.get(rail.id);
      if (!from || !to) continue;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x1 = a.right - origin.left;
      const y1 = a.top + a.height / 2 - origin.top;
      const x2 = b.left - origin.left;
      const y2 = b.top + b.height / 2 - origin.top;
      const mid = (x1 + x2) / 2;
      next.push({
        id: rail.id,
        d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${mid.toFixed(1)} ${y1.toFixed(1)}, ${mid.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`
      });
    }
    setWires((current) => {
      const same =
        current.length === next.length && current.every((wire, index) => wire.id === next[index]?.id && wire.d === next[index]?.d);
      return same ? current : next;
    });
  }, [power.rails]);

  useLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [measure, scenario]);

  const depthCount = power.rails.reduce((max, rail) => Math.max(max, rail.depth), 0);
  const columns = Array.from({ length: depthCount + 1 }, (_, depth) => power.rails.filter((rail) => rail.depth === depth));
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
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="order-2 space-y-4 xl:order-1 xl:col-span-7">
        <Panel
          eyebrow="Power tree"
          title="Rails"
          action={
            <TinyButton onClick={addRail} disabled={project.rails.length >= 12} tone="amber">
              <span className="inline-flex items-center gap-1">
                <Plus size={14} /> Add rail
              </span>
            </TinyButton>
          }
        >
          <div className="overflow-x-auto pb-2">
            <div ref={wrapRef} className="relative min-w-[760px]">
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                {wires.map((wire) => (
                  <path key={wire.id} d={wire.d} fill="none" stroke="#f59e0b" strokeWidth="1.4" className="wire" />
                ))}
              </svg>
              <div className="relative z-10 flex items-stretch gap-14">
                {columns.map((column, index) => (
                  <div key={index} className="flex flex-1 flex-col justify-center gap-3">
                    {column.map((rail) => {
                      const stats = rail.out[scenario];
                      const loads = project.loads.filter((load) => load.railId === rail.id);
                      const activeCard = selectedRail?.id === rail.id;
                      return (
                        <button
                          key={rail.id}
                          type="button"
                          ref={(node) => {
                            if (node) nodeRefs.current.set(rail.id, node);
                            else nodeRefs.current.delete(rail.id);
                          }}
                          onClick={() => setRailId(rail.id)}
                          className={cn(
                            "rounded-xl border bg-[#0c1118] p-3 text-left shadow-none",
                            rail.problems.length > 0 ? "border-red-400/50" : activeCard ? "border-amber-400/60" : "border-white/[0.08]"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-400/90">
                              {rail.kind === "source" ? "Source" : rail.kind === "buck" ? `Buck · ${rail.efficiencyPct}%` : "LDO"}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">{fmtA(rail.drawn[scenario].iAvgA)} in</span>
                          </div>
                          <div className="mt-1 truncate text-sm text-slate-100">{rail.name}</div>
                          <div className="mt-1 font-mono text-2xl tabular-nums text-amber-400">{rail.voltage.toFixed(2)} V</div>
                          <dl className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
                            <div>
                              <dt className="text-slate-500">Avg</dt>
                              <dd className="text-slate-200">{fmtA(stats.iAvgA)}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">RMS</dt>
                              <dd className="text-slate-200">{fmtA(stats.iRmsA)}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">Peak</dt>
                              <dd className="text-slate-200">{fmtA(stats.iPeakA)}</dd>
                            </div>
                          </dl>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {loads.map((load) => (
                              <span
                                key={load.id}
                                className={cn(
                                  "max-w-full truncate rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px]",
                                  modeIncluded(load.mode, scenario) ? "text-slate-300" : "text-slate-600"
                                )}
                              >
                                {load.name}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Currents on the cards follow {SCENARIO_META[scenario].label.toLowerCase()}. Dimmed loads are off in this case. Trace width stays on mission RMS.
          </p>
        </Panel>

        {selectedRail ? (
          <Panel eyebrow="Selected rail" title={selectedRail.name}>
            <div className="grid gap-4 sm:grid-cols-2">
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
              ) : selectedRail.kind === "ldo" ? (
                <NumberField
                  label="Quiescent current from parent"
                  unit="mA"
                  value={selectedRail.iqMa}
                  min={0}
                  max={20}
                  step={0.01}
                  onChange={(iqMa) => updateRail(selectedRail.id, { iqMa })}
                />
              ) : (
                <div className="flex gap-2 self-end">
                  <TinyButton tone="amber" onClick={() => updateRail(selectedRail.id, { voltage: 12 })}>
                    12 V
                  </TinyButton>
                  <TinyButton tone="amber" onClick={() => updateRail(selectedRail.id, { voltage: 24 })}>
                    24 V
                  </TinyButton>
                </div>
              )}
              {selectedRail.kind === "buck" ? (
                <NumberField
                  label="Quiescent current from parent"
                  unit="mA"
                  value={selectedRail.iqMa}
                  min={0}
                  max={20}
                  step={0.01}
                  onChange={(iqMa) => updateRail(selectedRail.id, { iqMa })}
                />
              ) : null}
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

        <Panel eyebrow="Registry" title="Loads">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-left">
              <thead className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-2 py-1 font-normal">Name</th>
                  <th className="px-2 py-1 font-normal">Rail</th>
                  <th className="px-2 py-1 font-normal">Mode</th>
                  <th className="px-2 py-1 font-normal">mA</th>
                  <th className="px-2 py-1 font-normal">Duty %</th>
                  <th className="px-2 py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {project.loads.map((load) => {
                  const activeRow = selectedLoad?.id === load.id;
                  return (
                    <tr
                      key={load.id}
                      onClick={() => setLoadId(load.id)}
                      className={cn("cursor-pointer", activeRow ? "bg-amber-500/[0.06]" : "hover:bg-white/[0.03]")}
                    >
                      <td className="rounded-l px-2 py-1">
                        <input
                          aria-label={`${load.name} name`}
                          value={load.name}
                          onChange={(event) => updateLoad(load.id, { name: event.target.value })}
                          className="w-full min-w-[10rem] rounded border border-transparent bg-transparent px-1 py-1 text-sm outline-none focus:border-white/15"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          aria-label={`${load.name} rail`}
                          value={load.railId}
                          onChange={(event) => updateLoad(load.id, { railId: event.target.value })}
                          className="w-full rounded border border-white/[0.08] bg-black/30 px-1 py-1 text-xs"
                        >
                          {project.rails.map((rail) => (
                            <option key={rail.id} value={rail.id}>
                              {rail.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select
                          aria-label={`${load.name} mode`}
                          value={load.mode}
                          onChange={(event) => updateLoad(load.id, { mode: event.target.value as LoadMode })}
                          className="rounded border border-white/[0.08] bg-black/30 px-1 py-1 text-xs"
                        >
                          <option value="idle">Idle</option>
                          <option value="active">Active</option>
                          <option value="burst">Burst</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <CellNumber
                          label={`${load.name} current`}
                          value={load.currentMa}
                          min={0}
                          max={20000}
                          step={0.01}
                          onChange={(currentMa) => updateLoad(load.id, { currentMa })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <CellNumber
                          label={`${load.name} duty`}
                          value={load.dutyPct}
                          min={0}
                          max={100}
                          step={0.1}
                          onChange={(dutyPct) => updateLoad(load.id, { dutyPct })}
                        />
                      </td>
                      <td className="rounded-r px-2 py-1">
                        <button
                          type="button"
                          aria-label={`Delete ${load.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteLoad(load.id);
                          }}
                          className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
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
          </div>
          {selectedLoad ? (
            <div className="mt-4 grid gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
              <NumberField
                label={`${selectedLoad.name} current`}
                unit="mA"
                value={selectedLoad.currentMa}
                min={0}
                max={8000}
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
            </div>
          ) : null}
        </Panel>

        <Panel eyebrow="Converters" title="Rail table">
          {railMessage ? <p className="mb-3 text-xs text-amber-200">{railMessage}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="py-1 pr-2 font-normal">Rail</th>
                  <th className="py-1 pr-2 font-normal">Kind</th>
                  <th className="py-1 pr-2 font-normal">Parent</th>
                  <th className="py-1 pr-2 font-normal">V</th>
                  <th className="py-1 pr-2 font-normal">η %</th>
                  <th className="py-1 pr-2 font-normal">Iq mA</th>
                  <th className="py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {project.rails.map((rail) => (
                  <tr key={rail.id} className="border-t border-white/[0.04]">
                    <td className="py-1.5 pr-2">
                      <input
                        aria-label={`${rail.name} name`}
                        value={rail.name}
                        onChange={(event) => updateRail(rail.id, { name: event.target.value })}
                        className="w-full min-w-[8rem] rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        aria-label={`${rail.name} kind`}
                        disabled={rail.kind === "source"}
                        value={rail.kind}
                        onChange={(event) => updateRail(rail.id, { kind: event.target.value as RailKind })}
                        className="rounded border border-white/[0.08] bg-black/30 px-1 py-1 disabled:opacity-60"
                      >
                        {rail.kind === "source" ? <option value="source">source</option> : null}
                        <option value="buck">buck</option>
                        <option value="ldo">ldo</option>
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        aria-label={`${rail.name} parent`}
                        disabled={rail.kind === "source"}
                        value={rail.parentId ?? ""}
                        onChange={(event) => updateRail(rail.id, { parentId: event.target.value })}
                        className="max-w-[10rem] rounded border border-white/[0.08] bg-black/30 px-1 py-1 disabled:opacity-60"
                      >
                        {rail.kind === "source" ? <option value="">—</option> : null}
                        {parentChoices(project.rails, rail.id).map((choice) => (
                          <option key={choice.id} value={choice.id}>
                            {choice.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <CellNumber label={`${rail.name} voltage`} value={rail.voltage} min={0.5} max={60} step={0.01} onChange={(voltage) => updateRail(rail.id, { voltage })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      {rail.kind === "buck" ? (
                        <CellNumber
                          label={`${rail.name} efficiency`}
                          value={rail.efficiencyPct}
                          min={50}
                          max={99}
                          step={0.1}
                          onChange={(efficiencyPct) => updateRail(rail.id, { efficiencyPct })}
                        />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {rail.kind === "source" ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <CellNumber label={`${rail.name} Iq`} value={rail.iqMa} min={0} max={20} step={0.01} onChange={(iqMa) => updateRail(rail.id, { iqMa })} />
                      )}
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        aria-label={`Delete ${rail.name}`}
                        disabled={rail.kind === "source" || project.rails.some((item) => item.parentId === rail.id)}
                        onClick={() => {
                          const removed = deleteRail(rail.id);
                          setRailMessage(removed ? null : "Move child rails off this node before deleting it.");
                        }}
                        className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  );
}
