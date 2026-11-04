"use client";

import { useState } from "react";
import { Equation, Flag, Metric, NumberField, Panel, SelectField, Warnings } from "@/components/ui";
import { useWorkbench } from "@/context/WorkbenchContext";
import { HIGH_SIDE } from "@/lib/components-db";
import { FUSE_MELT_I2T, WIRE_GAUGES } from "@/lib/engineering/harness";
import type { HarnessLoadKind, WireInsulation } from "@/lib/types";

export function HarnessStudio() {
  const { project, harness, setHarness, updateHarnessChannel } = useWorkbench();
  const [selected, setSelected] = useState(project.harness.channels[0]?.id ?? "");
  const channel = project.harness.channels.find((item) => item.id === selected) ?? project.harness.channels[0];
  const report = harness.channels.find((item) => item.channel.id === channel?.id);

  if (!channel || !report) return null;

  const lines = [
    `RDS(${report.tjC.toFixed(0)} °C) = ${ (report.rdsOhm * 1e3).toFixed(1) } mΩ, interpolated 25 °C → 150 °C`,
    `P = I²·RDS = ${report.pSteadyW.toFixed(3)} W on ${channel.name}`,
    `Tj = Ta + θJA·ΣP = ${report.tjC.toFixed(1)} °C on package ${channel.packageGroup}`,
    `Inrush P = ${report.inrushPW.toFixed(2)} W for ${(report.inrushS * 1e3).toFixed(0)} ms, ΔT = ${report.dTInrushC.toFixed(1)} °C`,
    `R_sense,max = Vadc·KILIS,min / I_limit = ${(report.rSenseMaxOhm).toFixed(0)} Ω`,
    `Recommended R_sense = 0.8·Rmax = ${report.rSenseOhm.toFixed(0)} Ω → fault sense ${report.vSenseFault.toFixed(2)} V`,
    `R_series = (Vrail − 3.3) / 0.5 mA = ${(report.rSeriesOhm / 1000).toFixed(1)} kΩ`,
    `R_loop = 2·L·ρ(T)/A = ${(report.loopOhm * 1e3).toFixed(1)} mΩ`,
    `V_drop = I·R_loop = ${(report.dropV * 1e3).toFixed(0)} mV`,
    `Wire I²t = (k·S)² = ${report.wireI2t.toFixed(0)} A²s, fuse I²t = ${report.fuseI2t.toFixed(0)} A²s`
  ];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <Panel eyebrow="VCU outputs" title="Channel">
          <SelectField
            label="Load"
            value={channel.id}
            onChange={setSelected}
            options={project.harness.channels.map((item) => ({ value: item.id, label: item.name }))}
          />
          <div className="mt-4 grid gap-4">
            <SelectField
              label="High-side switch"
              value={channel.switchId}
              onChange={(switchId) => updateHarnessChannel(channel.id, { switchId })}
              options={HIGH_SIDE.map((part) => ({ value: part.id, label: `${part.mpn} · ${part.channels} ch` }))}
            />
            <NumberField label="Steady current" unit="A" value={channel.currentA} min={0.05} max={40} step={0.05} onChange={(currentA) => updateHarnessChannel(channel.id, { currentA })} />
            <NumberField label="Harness length, one way" unit="m" value={channel.lengthM} min={0.5} max={5} step={0.1} onChange={(lengthM) => updateHarnessChannel(channel.id, { lengthM })} />
            <SelectField
              label="Conductor"
              value={String(channel.areaMm2)}
              onChange={(value) => updateHarnessChannel(channel.id, { areaMm2: Number(value) })}
              options={WIRE_GAUGES.map((gauge) => ({ value: String(gauge.areaMm2), label: `${gauge.label} · AWG ${gauge.awg}` }))}
            />
            <SelectField
              label="Insulation"
              value={channel.insulation}
              onChange={(insulation) => updateHarnessChannel(channel.id, { insulation: insulation as WireInsulation })}
              options={[
                { value: "xlpe", label: "XLPE / TXL · k = 143" },
                { value: "pvc", label: "PVC · k = 115" }
              ]}
            />
            <SelectField
              label="Fuse"
              value={String(channel.fuseA)}
              onChange={(value) => updateHarnessChannel(channel.id, { fuseA: Number(value) })}
              options={FUSE_MELT_I2T.map((fuse) => ({ value: String(fuse.ratingA), label: `${fuse.ratingA} A · I²t ${fuse.i2t}` }))}
            />
            <SelectField
              label="Inrush model"
              value={channel.loadKind}
              onChange={(loadKind) => updateHarnessChannel(channel.id, { loadKind: loadKind as HarnessLoadKind })}
              options={[
                { value: "resistive", label: "Resistive" },
                { value: "lamp", label: "Lamp, cold filament" },
                { value: "fan", label: "Fan or pump stall" },
                { value: "capacitive", label: "Capacitive" }
              ]}
            />
            {channel.loadKind === "capacitive" ? (
              <NumberField label="Load capacitance" unit="µF" value={channel.capacitanceF * 1e6} min={10} max={20000} step={10} onChange={(uf) => updateHarnessChannel(channel.id, { capacitanceF: uf * 1e-6 })} />
            ) : (
              <>
                <NumberField label="Inrush multiple" unit="×" value={channel.inrushMultiple} min={1} max={20} step={0.5} onChange={(inrushMultiple) => updateHarnessChannel(channel.id, { inrushMultiple })} />
                <NumberField label="Inrush duration" unit="ms" value={channel.inrushMs} min={1} max={2000} step={5} onChange={(inrushMs) => updateHarnessChannel(channel.id, { inrushMs })} />
              </>
            )}
            <NumberField label="Ambient" unit="°C" value={project.harness.ta} min={-40} max={105} step={1} onChange={(ta) => setHarness({ ta })} />
            <NumberField label="Rail voltage" unit="V" value={project.harness.vRail} min={8} max={32} step={0.1} onChange={(vRail) => setHarness({ vRail })} />
          </div>
        </Panel>
      </div>
      <div className="space-y-4 xl:col-span-7">
        <Panel eyebrow={report.part?.mpn ?? "Switch"} title={channel.name}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Channel loss" value={report.pSteadyW.toFixed(2)} unit="W" tone="amber" />
            <Metric label="Package Tj" value={report.tjC.toFixed(1)} unit="°C" tone={report.thermalOk ? "emerald" : "red"} detail={`Shutdown ${report.part?.tsdC ?? "—"} °C`} />
            <Metric label="Inrush ΔTj" value={report.dTInrushC.toFixed(1)} unit="°C" tone={report.tjInrushC < (report.part?.tsdC ?? 150) ? "emerald" : "red"} detail={report.inrushNote} />
            <Metric label="RDS hot" value={(report.rdsOhm * 1e3).toFixed(1)} unit="mΩ" />
            <Metric label="R_sense" value={report.rSenseOhm.toFixed(0)} unit="Ω" tone="cyan" detail={`Fault ${report.vSenseFault.toFixed(2)} V · load ${report.vSenseLoad.toFixed(3)} V`} />
            <Metric label="MCU series" value={(report.rSeriesOhm / 1000).toFixed(1)} unit="kΩ" detail="Limits pin injection to 0.5 mA" />
            <Metric label="Loop drop" value={(report.dropV * 1e3).toFixed(0)} unit="mV" tone={report.dropOk ? "emerald" : "red"} detail={`${channel.lengthM.toFixed(1)} m one way`} />
            <Metric label="Wire rise" value={report.wireRiseC.toFixed(1)} unit="°C" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Flag ok={report.fuseCoordinates}>Fuse I²t</Flag>
            <Flag ok={report.dropOk}>Drop</Flag>
            <Flag ok={report.thermalOk}>Thermal</Flag>
            <Flag ok={report.vSenseFault <= project.harness.vAdcMax}>ADC</Flag>
          </div>
        </Panel>
        <Panel eyebrow="All outputs" title="Fuse versus wire">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="font-mono text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Load</th>
                  <th className="py-1 pr-3">Drop</th>
                  <th className="py-1 pr-3">Wire °C</th>
                  <th className="py-1 pr-3">Fuse I²t</th>
                  <th className="py-1 pr-3">Wire I²t</th>
                  <th className="py-1">Tj</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-200">
                {harness.channels.map((row) => (
                  <tr key={row.channel.id} className="border-t border-white/[0.05]">
                    <td className="py-1.5 pr-3 text-slate-300">{row.channel.name}</td>
                    <td className="py-1.5 pr-3">{(row.dropV * 1e3).toFixed(0)} mV</td>
                    <td className="py-1.5 pr-3">{row.wireRiseC.toFixed(1)}</td>
                    <td className="py-1.5 pr-3">{row.fuseI2t.toFixed(0)}</td>
                    <td className="py-1.5 pr-3">{row.wireI2t.toFixed(0)}</td>
                    <td className="py-1.5">{row.tjC.toFixed(0)} °C</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel eyebrow="Audit" title="Plugged-in equations">
          <Equation lines={lines} />
        </Panel>
        <Warnings items={harness.warnings} />
      </div>
    </div>
  );
}
