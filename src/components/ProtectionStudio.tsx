"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Equation, Flag, Metric, NumberField, Panel, SelectField, Warnings } from "@/components/ui";
import { useWorkbench } from "@/context/WorkbenchContext";
import { BUCKS } from "@/lib/components-db";
import { TVS_PARTS } from "@/lib/engineering/protection";

export function ProtectionStudio() {
  const { project, protection, setProtection, power } = useWorkbench();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const input = project.protection;
  const sweep = protection.sweep.filter((_, index) => index % 2 === 0).map((point) => ({
    fKhz: point.fHz / 1e3,
    zOut: point.zOut,
    zIn: point.zIn
  }));
  const tvs = protection.tvs;
  const lines = [
    `Schottky Vf = 0.35 + I·0.045`,
    `P-MOSFET drop = I·RDS, peak column uses the hot RDS`,
    `Ideal-diode loss = I²·${(0.0045 * 1e3).toFixed(1)} mΩ + Vin·Iq`,
    `fc = 1/(2π√(LC)) = ${(protection.fcHz / 1e3).toFixed(2)} kHz`,
    `Z0 = √(L/C) = ${protection.z0.toFixed(3)} Ω`,
    `Rd recommended = Z0, Cd recommended = 4C = ${(protection.cdRecommended * 1e6).toFixed(1)} µF`,
    `|Zin| = η·Vin²/Pout = ${protection.zinDc.toFixed(2)} Ω below ${(protection.fCrossHz / 1e3).toFixed(1)} kHz`,
    `Peak |Zout|/|Zin| = ${protection.peakRatio.toFixed(3)} ${protection.stable ? "(under 0.1)" : "(above 0.1)"}`,
    `${tvs.part.id}: VRWM ${tvs.part.vrwm} V, VBR ${tvs.part.vbrMin}–${tvs.part.vbrMax} V, VC ${tvs.part.vc} V at ${tvs.part.ipp} A`,
    `Clamp margin = Vin_max − VC = ${Number.isFinite(tvs.marginV) ? tvs.marginV.toFixed(1) : "—"} V`,
    `Coil energy ½LI² = ${(tvs.energyJ * 1e3).toFixed(2)} mJ versus ${(tvs.energyRatingJ * 1e3).toFixed(0)} mJ rectangular rating`
  ];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <Panel
          eyebrow="Reverse polarity"
          title="Schottky, P-MOSFET, ideal diode"
          action={
            <button
              type="button"
              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300"
              onClick={() =>
                setProtection({
                  iRms: Math.round(power.scenarios.mission.inputRmsA * 1000) / 1000,
                  iPeak: Math.round(power.scenarios.peak.inputPeakA * 1000) / 1000
                })
              }
            >
              Use power-tree currents
            </button>
          }
        >
          <div className="grid gap-4">
            <NumberField label="Mission RMS current" unit="A" value={input.iRms} min={0.05} max={40} step={0.01} onChange={(iRms) => setProtection({ iRms })} />
            <NumberField label="Peak current" unit="A" value={input.iPeak} min={0.05} max={80} step={0.01} onChange={(iPeak) => setProtection({ iPeak })} />
            <NumberField label="P-MOSFET RDS 25 °C" unit="mΩ" value={input.pmosRdsOhm * 1e3} min={1} max={200} step={0.5} onChange={(milli) => setProtection({ pmosRdsOhm: milli / 1e3 })} />
            <NumberField label="P-MOSFET RDS hot" unit="mΩ" value={input.pmosRdsHotOhm * 1e3} min={1} max={300} step={0.5} onChange={(milli) => setProtection({ pmosRdsHotOhm: milli / 1e3 })} />
          </div>
        </Panel>
        <Panel eyebrow="ISO 7637-2 clamp" title="TVS versus downstream buck">
          <div className="grid gap-4">
            <SelectField
              label="GLV class"
              value={String(input.systemV)}
              onChange={(value) => {
                const systemV = Number(value);
                setProtection({ systemV, vSystemMax: systemV >= 24 ? 32 : 16, vin: systemV });
              }}
              options={[
                { value: "12", label: "12 V · standoff 16 V" },
                { value: "24", label: "24 V · standoff 32 V" }
              ]}
            />
            <SelectField
              label="TVS"
              value={input.tvsId}
              onChange={(tvsId) => setProtection({ tvsId })}
              options={TVS_PARTS.map((part) => ({ value: part.id, label: `${part.id} · VRWM ${part.vrwm} V · VC ${part.vc} V` }))}
            />
            <SelectField
              label="Downstream buck"
              value={input.buckId}
              onChange={(buckId) => setProtection({ buckId })}
              options={BUCKS.map((part) => ({ value: part.id, label: `${part.mpn} · ${part.vinMax} V max` }))}
            />
            <NumberField label="Coil inductance" unit="mH" value={input.lCoilH * 1e3} min={0.1} max={500} step={0.1} onChange={(mh) => setProtection({ lCoilH: mh / 1e3 })} />
            <NumberField label="Coil current" unit="A" value={input.iCoilA} min={0.05} max={20} step={0.05} onChange={(iCoilA) => setProtection({ iCoilA })} />
          </div>
        </Panel>
        <Panel eyebrow="Input filter" title="LC pi damper">
          <div className="grid gap-4">
            <NumberField label="Inductor" unit="µH" value={input.lH * 1e6} min={0.2} max={100} step={0.1} onChange={(uh) => setProtection({ lH: uh * 1e-6 })} />
            <NumberField label="Inductor DCR" unit="mΩ" value={input.rlOhm * 1e3} min={1} max={2000} step={1} onChange={(mo) => setProtection({ rlOhm: mo / 1e3 })} />
            <NumberField label="Shunt C" unit="µF" value={input.cF * 1e6} min={0.47} max={470} step={0.1} onChange={(uf) => setProtection({ cF: uf * 1e-6 })} />
            <NumberField label="Damper Cd" unit="µF" value={input.cdF * 1e6} min={0} max={1000} step={1} onChange={(uf) => setProtection({ cdF: uf * 1e-6 })} />
            <NumberField label="Damper Rd" unit="Ω" value={input.rdOhm} min={0} max={20} step={0.01} onChange={(rdOhm) => setProtection({ rdOhm })} />
            <NumberField label="Buck input" unit="V" value={input.vin} min={6} max={60} step={0.1} onChange={(vin) => setProtection({ vin })} />
            <NumberField label="Buck Pout" unit="W" value={input.pout} min={0.5} max={200} step={0.1} onChange={(pout) => setProtection({ pout })} />
            <NumberField label="Efficiency" unit="%" value={input.eta * 100} min={50} max={99} step={0.5} onChange={(pct) => setProtection({ eta: pct / 100 })} />
            <NumberField label="fsw" unit="kHz" value={input.fswHz / 1e3} min={100} max={2500} step={10} onChange={(khz) => setProtection({ fswHz: khz * 1e3 })} />
          </div>
          <button
            type="button"
            className="mt-3 rounded-md border border-cyan-400/30 px-2 py-1 text-xs text-cyan-200"
            onClick={() => setProtection({ rdOhm: Math.round(protection.z0 * 1000) / 1000, cdF: protection.cdRecommended })}
          >
            Apply Rd = Z0 and Cd = 4C
          </button>
        </Panel>
      </div>
      <div className="space-y-4 xl:col-span-7">
        <Panel eyebrow="Loss" title="Drop at RMS and at peak">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="font-mono text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Device</th>
                  <th className="py-1 pr-3">Drop RMS</th>
                  <th className="py-1 pr-3">Loss RMS</th>
                  <th className="py-1 pr-3">Drop peak</th>
                  <th className="py-1">Loss peak</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-200">
                {protection.polarity.map((row) => (
                  <tr key={row.id} className="border-t border-white/[0.05]">
                    <td className="py-1.5 pr-3 text-slate-300">{row.label}</td>
                    <td className="py-1.5 pr-3">{(row.dropRmsV * 1e3).toFixed(0)} mV</td>
                    <td className="py-1.5 pr-3">{row.lossRmsW.toFixed(3)} W</td>
                    <td className="py-1.5 pr-3">{(row.dropPeakV * 1e3).toFixed(0)} mV</td>
                    <td className="py-1.5">{row.lossPeakW.toFixed(3)} W</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel eyebrow={tvs.part.series} title={`${tvs.part.id} clamp check`}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="VRWM" value={tvs.part.vrwm.toFixed(1)} unit="V" tone={tvs.standoffOk ? "emerald" : "red"} />
            <Metric label="VBR min" value={tvs.part.vbrMin.toFixed(1)} unit="V" />
            <Metric label="VC" value={tvs.part.vc.toFixed(1)} unit="V" tone={tvs.clampOk ? "emerald" : "red"} detail={`Ipp ${tvs.part.ipp} A`} />
            <Metric label="Margin" value={Number.isFinite(tvs.marginV) ? tvs.marginV.toFixed(1) : "—"} unit="V" tone={tvs.clampOk ? "emerald" : "red"} detail={tvs.buck ? `${tvs.buck.mpn} max ${tvs.buck.vinMax} V` : ""} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Flag ok={tvs.standoffOk}>Standby</Flag>
            <Flag ok={tvs.clampOk}>Clamp</Flag>
            <Flag ok={tvs.energyOk}>Energy</Flag>
            <Flag ok={tvs.currentOk}>Pulse I</Flag>
          </div>
        </Panel>
        <Panel eyebrow="Middlebrook" title="Filter output impedance versus buck input impedance">
          <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="fc" value={(protection.fcHz / 1e3).toFixed(2)} unit="kHz" tone="cyan" />
            <Metric label="Z0" value={protection.z0.toFixed(3)} unit="Ω" />
            <Metric label="|Zin|" value={protection.zinDc.toFixed(2)} unit="Ω" detail="Below crossover" />
            <Metric label="Peak ratio" value={protection.peakRatio.toFixed(3)} tone={protection.stable ? "emerald" : "red"} detail={protection.stable ? "≥ 20 dB margin" : "Under-damped"} />
          </div>
          <div className="h-72 w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sweep} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="fKhz" scale="log" domain={["auto", "auto"]} tick={{ fill: "#8b97a8", fontSize: 11 }} tickFormatter={(value) => Number(value).toFixed(0)} unit=" kHz" />
                  <YAxis scale="log" domain={["auto", "auto"]} tick={{ fill: "#8b97a8", fontSize: 11 }} unit=" Ω" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="zOut" name="|Zout|" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="zIn" name="|Zin|" stroke="#06b6d4" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </Panel>
        <Panel eyebrow="Audit" title="Plugged-in equations">
          <Equation lines={lines} />
        </Panel>
        <Warnings items={protection.warnings} />
      </div>
    </div>
  );
}
