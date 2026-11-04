"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useWorkbench } from "@/context/WorkbenchContext";
import { fmtTemp, fmtW } from "@/lib/format";
import { PACKAGES, regulatorCurve, type ThermalZoneId } from "@/lib/engineering/regulator";
import { Equation, Metric, NumberField, Panel, Segmented, SelectField, TinyButton, Warnings, cn } from "@/components/ui";

const ZONE_BAR: Record<ThermalZoneId, string> = {
  safe: "#10b981",
  warning: "#eab308",
  derate: "#f97316",
  shutdown: "#ef4444"
};

function Meter({ tj, ta }: { tj: number; ta: number }) {
  const min = 20;
  const max = 170;
  const pos = (temp: number) => `${((Math.min(max, Math.max(min, temp)) - min) / (max - min)) * 100}%`;
  const zones = [
    { from: 20, to: 70, color: ZONE_BAR.safe },
    { from: 70, to: 100, color: ZONE_BAR.warning },
    { from: 100, to: 115, color: ZONE_BAR.derate },
    { from: 115, to: 170, color: ZONE_BAR.shutdown }
  ];
  return (
    <div>
      <div className="relative h-4 overflow-hidden rounded-full bg-black/40">
        {zones.map((zone) => (
          <span
            key={zone.color}
            className="absolute inset-y-0"
            style={{
              left: pos(zone.from),
              width: `calc(${pos(zone.to)} - ${pos(zone.from)})`,
              background: zone.color,
              opacity: 0.9
            }}
          />
        ))}
        <span className="absolute inset-y-[-4px] w-0.5 bg-white" style={{ left: pos(tj) }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{min}°C</span>
        <span>70</span>
        <span>100</span>
        <span>115</span>
        <span>{max}°C</span>
      </div>
      <p className="mt-2 font-mono text-[11px] text-slate-500">Ambient marker {ta.toFixed(0)} °C. The white line is Tⱼ{tj > max ? ", pinned at the right because it is off this scale" : ""}.</p>
    </div>
  );
}

function ChartTip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-[#0c1118] px-3 py-2 text-xs shadow-lg">
      <p className="font-mono text-slate-400">{Number(label).toFixed(3)} A</p>
      {payload.map((item) => (
        <p key={String(item.dataKey)} className="font-mono" style={{ color: item.color }}>
          {item.dataKey === "tj" ? `${Number(item.value).toFixed(1)} °C` : `${Number(item.value).toFixed(2)} %`}
        </p>
      ))}
    </div>
  );
}

export function RegulatorStudio() {
  const { project, power, regulator, setRegulator } = useWorkbench();
  const [mounted, setMounted] = useState(false);
  const input = project.regulator;
  const curve = useMemo(() => regulatorCurve(input), [input]);
  useEffect(() => setMounted(true), []);

  const zoneTone = !regulator.valid
    ? "red"
    : regulator.zone.id === "safe"
      ? "emerald"
      : regulator.zone.id === "warning"
        ? "yellow"
        : "red";

  const lines = regulator.valid
    ? input.architecture === "ldo"
      ? [
          `P_pass = (Vin − Vout)·Iout = (${input.vin.toFixed(2)} − ${input.vout.toFixed(2)})·${input.iout.toFixed(4)} = ${(regulator.terms.find((term) => term.id === "pass")?.watts ?? 0).toFixed(4)} W`,
          `P_iq = Vin·Iq = ${input.vin.toFixed(2)} · ${(input.iqMa / 1000).toFixed(6)} = ${(regulator.terms.find((term) => term.id === "iq")?.watts ?? 0).toFixed(4)} W`,
          `P_loss = P_pass + P_iq = ${regulator.pLossW.toFixed(4)} W`,
          `P_out = Vout·Iout = ${regulator.pOutW.toFixed(4)} W`,
          `η = 100 · P_out / (P_out + P_loss) = ${regulator.efficiencyPct.toFixed(2)} %`,
          `Tj = Ta + P_loss · θJA = ${input.ta.toFixed(1)} + ${regulator.pLossW.toFixed(4)} · ${regulator.rthJA.toFixed(1)} = ${regulator.tj.toFixed(1)} °C`
        ]
      : [
          `D = Vout/Vin = ${(regulator.duty ?? 0).toFixed(4)}    ideal CCM, FET and inductor drops ignored`,
          ...regulator.terms.map((term) => `${term.label} = ${(term.watts * 1000).toFixed(2)} mW${term.inPackage ? "" : "   [not in Tj]"}`),
          `P_package = ${regulator.pPackageW.toFixed(4)} W`,
          `P_loss = P_package + P_DCR = ${regulator.pLossW.toFixed(4)} W`,
          `η = 100 · P_out / (P_out + P_loss) = ${regulator.efficiencyPct.toFixed(2)} %`,
          `Tj = Ta + P_package · θJA = ${input.ta.toFixed(1)} + ${regulator.pPackageW.toFixed(4)} · ${regulator.rthJA.toFixed(1)} = ${regulator.tj.toFixed(1)} °C`
        ]
    : ["Inputs are outside the regulating region, so loss and junction temperature are not reported."];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <Panel eyebrow="Architecture" title="Regulator">
          <Segmented
            label="Regulator architecture"
            value={input.architecture}
            onChange={(architecture) => setRegulator({ architecture })}
            options={[
              { id: "ldo", label: "LDO" },
              { id: "buck", label: "Sync buck" }
            ]}
          />
          <div className="mt-4">
            <SelectField
              label="Copy a rail from the power tree (mission RMS)"
              value=""
              onChange={(id) => {
                if (!id) return;
                const rail = project.rails.find((item) => item.id === id);
                const parent = project.rails.find((item) => item.id === rail?.parentId);
                const report = power.rails.find((item) => item.id === id);
                if (!rail || rail.kind === "source" || !parent || !report) return;
                setRegulator({
                  architecture: rail.kind === "ldo" ? "ldo" : "buck",
                  vin: parent.voltage,
                  vout: rail.voltage,
                  iout: Math.round(report.out.mission.iRmsA * 1000) / 1000,
                  iqMa: rail.iqMa
                });
              }}
              options={[
                { value: "", label: "Apply a rail…" },
                ...project.rails
                  .filter((rail) => rail.kind !== "source")
                  .map((rail) => ({ value: rail.id, label: rail.name }))
              ]}
            />
          </div>
          <div className="mt-4 grid gap-4">
            <NumberField label="Input voltage" unit="V" value={input.vin} min={1} max={60} step={0.01} onChange={(vin) => setRegulator({ vin })} />
            <NumberField label="Output voltage" unit="V" value={input.vout} min={0.8} max={48} step={0.01} onChange={(vout) => setRegulator({ vout })} />
            <NumberField label="Load current" unit="A" value={input.iout} min={0} max={8} step={0.001} onChange={(iout) => setRegulator({ iout })} />
            <NumberField label="Quiescent current" unit="mA" value={input.iqMa} min={0} max={20} step={0.01} onChange={(iqMa) => setRegulator({ iqMa })} />
            <NumberField label="Ambient temperature" unit="°C" value={input.ta} min={-40} max={125} step={1} onChange={(ta) => setRegulator({ ta })} />
          </div>
        </Panel>

        <Panel eyebrow="Package" title="Thermal resistance">
          <SelectField
            label="Package"
            value={input.packageId}
            onChange={(packageId) => setRegulator({ packageId: packageId as typeof input.packageId })}
            options={PACKAGES.map((pkg) => ({ value: pkg.id, label: `${pkg.label} · ${pkg.rthJA} °C/W` }))}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{regulator.rthNote}</p>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={input.rthOverride !== null}
              onChange={(event) => {
                const pkg = PACKAGES.find((item) => item.id === input.packageId) ?? PACKAGES[0];
                setRegulator({ rthOverride: event.target.checked ? pkg.rthJA : null });
              }}
            />
            Override θJA with a datasheet value
          </label>
          {input.rthOverride !== null ? (
            <div className="mt-3">
              <NumberField
                label="Datasheet θJA"
                unit="°C/W"
                value={input.rthOverride}
                min={5}
                max={400}
                step={0.1}
                onChange={(rthOverride) => setRegulator({ rthOverride })}
              />
            </div>
          ) : null}
        </Panel>

        {input.architecture === "buck" ? (
          <Panel eyebrow="Synchronous buck" title="Loss model">
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              Defaults suit a low-voltage integrated buck. Raise Rds(on) for a 24 V device. Inductor DCR heats the choke, not the package, so it is in efficiency and out of Tⱼ.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Switching frequency" unit="kHz" value={input.fswKhz} min={100} max={3000} step={10} onChange={(fswKhz) => setRegulator({ fswKhz })} />
              <NumberField label="High-side Rds(on)" unit="mΩ" value={input.rdsHsMo} min={1} max={300} step={0.5} onChange={(rdsHsMo) => setRegulator({ rdsHsMo })} />
              <NumberField label="Low-side Rds(on)" unit="mΩ" value={input.rdsLsMo} min={1} max={300} step={0.5} onChange={(rdsLsMo) => setRegulator({ rdsLsMo })} />
              <NumberField label="Rise time" unit="ns" value={input.trNs} min={0.5} max={50} step={0.5} onChange={(trNs) => setRegulator({ trNs })} />
              <NumberField label="Fall time" unit="ns" value={input.tfNs} min={0.5} max={50} step={0.5} onChange={(tfNs) => setRegulator({ tfNs })} />
              <NumberField label="Dead time, both edges" unit="ns" value={input.tDeadNs} min={0} max={100} step={1} onChange={(tDeadNs) => setRegulator({ tDeadNs })} />
              <NumberField label="Body diode Vsd" unit="V" value={input.vsd} min={0.3} max={1.2} step={0.01} onChange={(vsd) => setRegulator({ vsd })} />
              <NumberField label="Inductor DCR" unit="mΩ" value={input.dcrMo} min={1} max={200} step={0.5} onChange={(dcrMo) => setRegulator({ dcrMo })} />
              <NumberField label="Total gate charge" unit="nC" value={input.qgNc} min={0.2} max={40} step={0.1} onChange={(qgNc) => setRegulator({ qgNc })} />
              <NumberField label="Gate drive" unit="V" value={input.vdrive} min={3} max={12} step={0.1} onChange={(vdrive) => setRegulator({ vdrive })} />
            </div>
          </Panel>
        ) : null}
      </div>

      <div className="space-y-4 xl:col-span-7">
        <Panel
          eyebrow={regulator.valid ? regulator.zone.detail : "Input check"}
          title={regulator.valid ? regulator.zone.label : "Not regulating"}
          action={
            <span
              className={cn(
                "rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wide",
                zoneTone === "emerald" && "bg-emerald-500/15 text-emerald-300",
                zoneTone === "yellow" && "bg-yellow-500/15 text-yellow-200",
                zoneTone === "red" && "bg-red-500/15 text-red-300"
              )}
            >
              {regulator.valid ? regulator.zone.label : "Invalid"}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Junction" value={regulator.valid ? fmtTemp(regulator.tj) : "—"} unit="°C" tone={zoneTone} />
            <Metric
              label="Efficiency"
              value={regulator.valid ? regulator.efficiencyPct.toFixed(2) : "—"}
              unit="%"
              tone={regulator.valid && regulator.efficiencyPct >= 80 ? "emerald" : regulator.valid && regulator.efficiencyPct >= 55 ? "amber" : "red"}
            />
            <Metric label="Total loss" value={regulator.valid ? fmtW(regulator.pLossW) : "—"} unit="W" tone="amber" />
            <Metric label="θJA" value={regulator.rthJA.toFixed(1)} unit="°C/W" detail={regulator.overridden ? "Datasheet override" : input.packageId} />
          </div>
          {regulator.valid ? (
            <div className="mt-4">
              <Meter tj={regulator.tj} ta={input.ta} />
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wide text-slate-400">
                <span className="text-emerald-400">Safe &lt; 70</span>
                <span className="text-yellow-300">Warning 70–100</span>
                <span className="text-orange-400">Derate 100–115</span>
                <span className="text-red-400">Shutdown &gt; 115</span>
              </div>
            </div>
          ) : null}
          <ul className="mt-4 space-y-1 font-mono text-xs text-slate-300">
            {regulator.terms.map((term) => (
              <li key={term.id} className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-1">
                <span className="text-slate-400">{term.label}</span>
                <span>{(term.watts * 1000).toFixed(2)} mW</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel eyebrow="Sweep" title="Efficiency and junction vs load">
          <div className="h-72 w-full">
            {mounted && regulator.valid ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="iout" tick={{ fill: "#8b97a8", fontSize: 11 }} tickFormatter={(value) => Number(value).toFixed(2)} unit=" A" />
                  <YAxis yAxisId="eff" domain={[0, 100]} tick={{ fill: "#8b97a8", fontSize: 11 }} unit="%" />
                  <YAxis yAxisId="tj" orientation="right" tick={{ fill: "#8b97a8", fontSize: 11 }} unit="°" />
                  <Tooltip content={<ChartTip />} />
                  <ReferenceLine yAxisId="tj" y={70} stroke="#10b981" strokeDasharray="3 4" />
                  <ReferenceLine yAxisId="tj" y={115} stroke="#ef4444" strokeDasharray="3 4" />
                  <ReferenceLine yAxisId="eff" x={input.iout} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Line yAxisId="eff" type="monotone" dataKey="efficiencyPct" name="Efficiency" stroke="#10b981" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line yAxisId="tj" type="monotone" dataKey="tj" name="Tj" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                {regulator.valid ? "Preparing the sweep…" : "Fix the input voltages to plot the sweep."}
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Green is efficiency. Amber is junction temperature. The amber vertical line is the operating current. Horizontal lines sit at 70 °C and 115 °C.</p>
        </Panel>

        <Panel eyebrow="Audit" title="Plugged-in equations">
          <Equation lines={lines} />
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            θJA is still air, junction to ambient. Forced air or a large plane runs cooler, and a closed enclosure runs hotter. Confirm the number on the regulator datasheet before you sign the layout off. The LDO pass term is (Vin − Vout)·Iout; Iq is added on the next line because it is real heat in the package.
          </p>
        </Panel>
        <Warnings items={regulator.warnings} />
        <div className="flex gap-2">
          <TinyButton tone="amber" onClick={() => setRegulator({ architecture: "ldo", vin: 5, vout: 3.3, packageId: "SOT-23", rthOverride: null })}>
            Stress SOT-23
          </TinyButton>
          <TinyButton tone="amber" onClick={() => setRegulator({ architecture: "buck", vin: 24, vout: 5, packageId: "QFN", rthOverride: null })}>
            24 V to 5 V buck
          </TinyButton>
        </div>
      </div>
    </div>
  );
}
