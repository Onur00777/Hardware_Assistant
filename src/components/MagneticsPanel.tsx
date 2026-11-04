"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Equation, Metric, NumberField, Panel, SelectField, Warnings } from "@/components/ui";
import { useWorkbench } from "@/context/WorkbenchContext";
import { BUCKS } from "@/lib/components-db";
import { analyzeInductor, analyzeMlcc, INDUCTORS } from "@/lib/engineering/magnetics";
import type { MlccCase, MlccDielectric } from "@/lib/types";

export function MagneticsPanel() {
  const { project, setRegulator, setMagnetics, setCapacitance } = useWorkbench();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reg = project.regulator;
  const mag = project.magnetics;
  const fHz = reg.fswKhz * 1e3;
  const inductor = useMemo(
    () => analyzeInductor(reg.vin, reg.vout, reg.iout, fHz, mag),
    [reg.vin, reg.vout, reg.iout, fHz, mag]
  );
  const mlcc = useMemo(
    () => analyzeMlcc(inductor.valid ? inductor.dI : mag.rippleFraction * reg.iout, fHz, mag),
    [inductor.valid, inductor.dI, mag, fHz, reg.iout]
  );

  const sweep = inductor.sweep.map((point) => ({
    fKhz: point.fHz / 1e3,
    copperMw: point.pCopper * 1e3,
    coreMw: point.pCore * 1e3,
    dI: point.dI
  }));
  const bias = mlcc.curve.map((point) => ({
    v: point.vdc,
    nominalUf: point.cNominalF * 1e6,
    effectiveUf: point.cEffectiveF * 1e6,
    rippleMv: point.rippleEffectiveV * 1e3
  }));

  const lines = inductor.valid
    ? [
        `D = Vout/Vin = ${inductor.duty.toFixed(4)}`,
        `ΔI = k·Iout = ${mag.rippleFraction.toFixed(2)} · ${reg.iout.toFixed(3)} = ${(mag.rippleFraction * reg.iout).toFixed(4)} A at the ripple target`,
        `L = (Vin−Vout)·D / (f·ΔI_target) = ${(analyzeRequiredUh(reg.vin, reg.vout, reg.iout, fHz, mag.rippleFraction)).toFixed(2)} µH required`,
        `Operating L = ${(inductor.lH * 1e6).toFixed(2)} µH, so ΔI = ${inductor.dI.toFixed(4)} A`,
        `Ipeak = Iout + ΔI/2 = ${inductor.iPeak.toFixed(3)} A`,
        `Isat ≥ Ipeak·(1+${mag.satMargin.toFixed(2)}) = ${inductor.iSatMin.toFixed(3)} A`,
        `Irms = √(Iout² + ΔI²/12) = ${inductor.iRms.toFixed(3)} A`,
        `R(T) = R25·(1+0.00393·(T−25)) = ${(inductor.dcrOhm * 1e3).toFixed(2)} mΩ`,
        `Pcu = Irms²·R = ${(inductor.pCopper * 1e3).toFixed(1)} mW`,
        `Pcore from iGSE, ΔB = ${inductor.deltaBT.toFixed(3)} T → ${(inductor.pCore * 1e3).toFixed(1)} mW`,
        `Ceff = N·Cnom·kDC·kT = ${(mlcc.cEffectiveF * 1e6).toFixed(2)} µF (${(mlcc.retention * 100).toFixed(1)}% of nameplate)`,
        `ΔVout = ΔI/(8·f·Ceff) + ΔI·ESR = ${(mlcc.rippleV * 1e3).toFixed(1)} mV`
      ]
    : inductor.warnings;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <Panel eyebrow="Magnetics" title="Buck inductor sizer">
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            Volt-seconds use the regulator Vin, Vout, Iout and fsw. Ripple fraction k is the 20–40% CCM rule. Saturation is Ipeak with a 25% margin. Core loss is iGSE on a 3C90-class ferrite, so the frequency slope is physical once a volume and Isat are known.
          </p>
          <SelectField
            label="Load FET parameters from a catalog buck"
            value=""
            onChange={(id) => {
              const part = BUCKS.find((item) => item.id === id);
              if (!part) return;
              setRegulator({
                architecture: "buck",
                rdsHsMo: part.rdsHsOhm * 1e3,
                rdsLsMo: part.synchronous ? part.rdsLsOhm * 1e3 : reg.rdsLsMo,
                iqMa: part.iqA * 1e3,
                fswKhz: part.fswTypHz / 1e3,
                vin: Math.min(reg.vin, part.vinMax)
              });
            }}
            options={[{ value: "", label: "Apply an IC…" }, ...BUCKS.map((part) => ({ value: part.id, label: `${part.mpn} · ${part.vinMax} V / ${part.ioutMax} A` }))]}
          />
          <div className="mt-4 grid gap-4">
            <NumberField label="Ripple fraction" unit="·Iout" value={mag.rippleFraction} min={0.1} max={0.6} step={0.01} onChange={(rippleFraction) => setMagnetics({ rippleFraction })} />
            <NumberField label="Isat margin" unit="fraction" value={mag.satMargin} min={0} max={1} step={0.05} onChange={(satMargin) => setMagnetics({ satMargin })} />
            <NumberField label="Copper temperature" unit="°C" value={mag.tempC} min={-40} max={150} step={1} onChange={(tempC) => setMagnetics({ tempC })} />
            <SelectField
              label="Inductor"
              value={mag.inductorId}
              onChange={(inductorId) => setMagnetics({ inductorId })}
              options={[
                { value: "sized", label: "Use the calculated L" },
                ...INDUCTORS.map((item) => ({ value: item.id, label: `${item.mpn} · ${(item.lH * 1e6).toFixed(1)} µH` }))
              ]}
            />
            {mag.inductorId === "sized" ? (
              <>
                <NumberField label="DCR at 25 °C" unit="mΩ" value={mag.dcrMo} min={1} max={500} step={0.5} onChange={(dcrMo) => setMagnetics({ dcrMo })} />
                <NumberField label="Core volume" unit="cm³" value={mag.volumeCm3} min={0.01} max={2} step={0.01} onChange={(volumeCm3) => setMagnetics({ volumeCm3 })} />
              </>
            ) : null}
          </div>
        </Panel>
        <Panel eyebrow="Capacitor" title="MLCC DC-bias and temperature">
          <div className="grid gap-4">
            <SelectField
              label="Case"
              value={mag.mlccCase}
              onChange={(mlccCase) => setMagnetics({ mlccCase: mlccCase as MlccCase })}
              options={["0402", "0603", "0805", "1206"].map((id) => ({ value: id, label: id }))}
            />
            <SelectField
              label="Dielectric"
              value={mag.mlccDielectric}
              onChange={(mlccDielectric) => setMagnetics({ mlccDielectric: mlccDielectric as MlccDielectric })}
              options={[
                { value: "X7R", label: "X7R" },
                { value: "X5R", label: "X5R" }
              ]}
            />
            <NumberField label="Nameplate, each" unit="µF" value={mag.cNomUf} min={0.1} max={100} step={0.1} onChange={(cNomUf) => setMagnetics({ cNomUf })} />
            <NumberField label="Voltage rating" unit="V" value={mag.vRated} min={4} max={50} step={0.1} onChange={(vRated) => setMagnetics({ vRated })} />
            <NumberField label="DC bias" unit="V" value={mag.vdc} min={0} max={48} step={0.1} onChange={(vdc) => setMagnetics({ vdc })} />
            <NumberField label="Pieces in parallel" unit="" value={mag.mlccCount} min={1} max={12} step={1} onChange={(mlccCount) => setMagnetics({ mlccCount })} />
            <NumberField label="ESR, each" unit="mΩ" value={mag.esrMo} min={0.5} max={100} step={0.5} onChange={(esrMo) => setMagnetics({ esrMo })} />
            <NumberField label="Capacitor temperature" unit="°C" value={mag.mlccTempC} min={-55} max={150} step={1} onChange={(mlccTempC) => setMagnetics({ mlccTempC })} />
          </div>
          <button
            type="button"
            className="mt-3 rounded-md border border-cyan-400/30 px-2 py-1 text-xs text-cyan-200"
            onClick={() => setCapacitance({ mlccRetention: Math.round(mlcc.retention * 1000) / 1000 })}
          >
            Push {(mlcc.retention * 100).toFixed(1)}% retention into the bulk-cap tool
          </button>
        </Panel>
      </div>
      <div className="space-y-4 xl:col-span-7">
        <Panel eyebrow="Result" title="L, saturation, copper and core">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Inductance" value={inductor.valid ? (inductor.lH * 1e6).toFixed(2) : "—"} unit="µH" tone="amber" />
            <Metric label="Ripple ΔI" value={inductor.valid ? inductor.dI.toFixed(3) : "—"} unit="A" />
            <Metric label="Ipeak" value={inductor.valid ? inductor.iPeak.toFixed(3) : "—"} unit="A" tone="amber" />
            <Metric label="Isat min" value={inductor.valid ? inductor.iSatMin.toFixed(3) : "—"} unit="A" tone="emerald" detail="Includes the saturation margin" />
            <Metric label="Copper" value={inductor.valid ? (inductor.pCopper * 1e3).toFixed(0) : "—"} unit="mW" tone="amber" />
            <Metric label="Core" value={inductor.valid ? (inductor.pCore * 1e3).toFixed(0) : "—"} unit="mW" tone="cyan" />
            <Metric label="C effective" value={(mlcc.cEffectiveF * 1e6).toFixed(2)} unit="µF" tone="cyan" detail={`${(mlcc.retentionDc * 100).toFixed(0)}% bias · ${(mlcc.retentionTemp * 100).toFixed(0)}% temp`} />
            <Metric label="ΔVout" value={(mlcc.rippleV * 1e3).toFixed(1)} unit="mV" tone={mlcc.rippleV < 0.05 ? "emerald" : "yellow"} />
          </div>
        </Panel>
        <Panel eyebrow="200 kHz to 2.2 MHz" title="Loss at constant L">
          <div className="h-64 w-full">
            {mounted && sweep.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sweep} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="fKhz" tick={{ fill: "#8b97a8", fontSize: 11 }} tickFormatter={(value) => Number(value).toFixed(0)} unit=" kHz" />
                  <YAxis tick={{ fill: "#8b97a8", fontSize: 11 }} unit=" mW" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="copperMw" name="Copper" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="coreMw" name="Core" stroke="#06b6d4" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">Set Vin above Vout to sweep the choke.</div>
            )}
          </div>
        </Panel>
        <Panel eyebrow="DC bias" title="Nameplate versus derated capacitance">
          <div className="h-64 w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bias} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="v" tick={{ fill: "#8b97a8", fontSize: 11 }} unit=" V" />
                  <YAxis tick={{ fill: "#8b97a8", fontSize: 11 }} unit=" µF" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="nominalUf" name="Nominal" stroke="#64748b" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="effectiveUf" name="Derated" stroke="#06b6d4" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Capacitive ripple is ΔI/(8 f C). ESR adds ΔI·ESR. The grey line is the nameplate; cyan is after DC bias and the temperature factor.
          </p>
        </Panel>
        <Panel eyebrow="Audit" title="Plugged-in equations">
          <Equation lines={lines} />
        </Panel>
        <Warnings items={[...inductor.warnings, ...mlcc.warnings]} />
      </div>
    </div>
  );
}

function analyzeRequiredUh(vin: number, vout: number, iout: number, fHz: number, k: number): number {
  if (vin <= vout || iout <= 0 || fHz <= 0 || k <= 0) return 0;
  const duty = vout / vin;
  return ((((vin - vout) * duty) / (fHz * k * iout)) * 1e6);
}
