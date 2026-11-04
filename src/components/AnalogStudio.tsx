"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Equation, Flag, Metric, NumberField, Panel, SelectField, TinyButton, Warnings } from "@/components/ui";
import { useWorkbench } from "@/context/WorkbenchContext";
import type { ResistorSeries } from "@/lib/types";

export function AnalogStudio() {
  const { project, analog, setAnalog } = useWorkbench();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const input = project.analog;
  const divider = analog.divider;
  const chart = analog.ntc.points.filter((point) => point.tempC % 2 === 0).map((point) => ({
    temp: point.tempC,
    counts: point.counts,
    cPerLsb: point.cPerLsb
  }));
  const lines = [
    `Ideal R1 = R2·(Vin/Vadc − 1), then both snap to ${input.series}`,
    `R1 = ${divider.r1.toFixed(0)} Ω, R2 = ${divider.r2.toFixed(0)} Ω`,
    `Vadc = Vin·R2/(R1+R2) = ${divider.voutAtMax.toFixed(3)} V at ${input.vinSense.toFixed(1)} V (${divider.ratioErrorPct.toFixed(2)}% from target)`,
    `Rth = R1∥R2 = ${divider.rThevenin.toFixed(0)} Ω versus R_ADC ${input.rAdcOhm.toFixed(0)} Ω`,
    `P = Vin²/(R1+R2) = ${(divider.pTotal * 1e3).toFixed(2)} mW`,
    `ΔV = V·Cadc/(Cfilt+Cadc), droop = ${divider.droopLsb.toFixed(3)} LSB`,
    `Cfilt,min for 0.5 LSB = ${(divider.cFiltMin * 1e9).toFixed(1)} nF`,
    `f−3dB = 1/(2π·Rth·Cfilt) = ${(divider.f3dbHz / 1e3).toFixed(2)} kHz`,
    `Settling residual after ${input.tSampleUs.toFixed(2)} µs = ${divider.settlingLsb.toFixed(3)} LSB`,
    `NTC at 25 °C is ${analog.ntc.at25?.counts.toFixed(1) ?? "—"} counts, ${analog.ntc.at25?.cPerLsb.toFixed(3) ?? "—"} °C/LSB`
  ];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <Panel eyebrow="Sense" title="Divider and anti-alias">
          <div className="mb-3 flex flex-wrap gap-2">
            <TinyButton tone="amber" onClick={() => setAnalog({ vinSense: 32, vAdcTarget: 3, r2Ohm: 10000 })}>
              24 V GLV
            </TinyButton>
            <TinyButton tone="cyan" onClick={() => setAnalog({ vinSense: 5, vAdcTarget: 3.3, r2Ohm: 10000 })}>
              APPS 5 V
            </TinyButton>
            <TinyButton tone="cyan" onClick={() => setAnalog({ vinSense: 5, vAdcTarget: 3.0, r2Ohm: 4700 })}>
              Brake pressure
            </TinyButton>
          </div>
          <div className="grid gap-4">
            <NumberField label="Full-scale input" unit="V" value={input.vinSense} min={1} max={60} step={0.1} onChange={(vinSense) => setAnalog({ vinSense })} />
            <NumberField label="ADC target" unit="V" value={input.vAdcTarget} min={0.5} max={3.3} step={0.01} onChange={(vAdcTarget) => setAnalog({ vAdcTarget })} />
            <SelectField
              label="Resistor series"
              value={input.series}
              onChange={(series) => setAnalog({ series: series as ResistorSeries })}
              options={[
                { value: "E96", label: "E96 · 1%" },
                { value: "E24", label: "E24 · 5%" }
              ]}
            />
            <NumberField label="Preferred R2" unit="Ω" value={input.r2Ohm} min={100} max={1e6} step={100} onChange={(r2Ohm) => setAnalog({ r2Ohm })} />
            <NumberField label="ADC reference" unit="V" value={input.vref} min={1.8} max={3.6} step={0.01} onChange={(vref) => setAnalog({ vref })} />
            <NumberField label="C_ADC" unit="pF" value={input.cAdcF * 1e12} min={1} max={20} step={0.1} onChange={(pf) => setAnalog({ cAdcF: pf * 1e-12 })} />
            <NumberField label="R_ADC switch" unit="Ω" value={input.rAdcOhm} min={100} max={10000} step={50} onChange={(rAdcOhm) => setAnalog({ rAdcOhm })} />
            <NumberField label="C_filt" unit="nF" value={input.cFiltF * 1e9} min={1} max={1000} step={1} onChange={(nf) => setAnalog({ cFiltF: nf * 1e-9 })} />
            <NumberField label="Sample window" unit="µs" value={input.tSampleUs} min={0.1} max={20} step={0.1} onChange={(tSampleUs) => setAnalog({ tSampleUs })} />
          </div>
        </Panel>
        <Panel eyebrow="Temperature" title="NTC beta / Steinhart–Hart">
          <div className="grid gap-4">
            <NumberField label="R0" unit="Ω" value={input.ntcR0} min={100} max={1e6} step={100} onChange={(ntcR0) => setAnalog({ ntcR0 })} />
            <NumberField label="Beta" unit="K" value={input.ntcBeta} min={2000} max={5000} step={10} onChange={(ntcBeta) => setAnalog({ ntcBeta })} />
            <NumberField label="Pull-up" unit="Ω" value={input.rFixed} min={100} max={1e6} step={100} onChange={(rFixed) => setAnalog({ rFixed })} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            The plotted curve is the beta equation. With C = 0 the Steinhart–Hart coefficients A = 1/T0 − ln(R0)/β and B = 1/β reproduce it.
          </p>
        </Panel>
      </div>
      <div className="space-y-4 xl:col-span-7">
        <Panel eyebrow="STM32 sample and hold" title="Divider result">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="R1" value={(divider.r1 / 1000).toFixed(2)} unit="kΩ" tone="amber" />
            <Metric label="R2" value={(divider.r2 / 1000).toFixed(2)} unit="kΩ" />
            <Metric label="V at full scale" value={divider.voutAtMax.toFixed(3)} unit="V" tone={Math.abs(divider.ratioErrorPct) < 1 ? "emerald" : "yellow"} detail={`${divider.ratioErrorPct.toFixed(2)}%`} />
            <Metric label="Rth" value={divider.rThevenin.toFixed(0)} unit="Ω" tone="cyan" detail={`R_ADC is ${input.rAdcOhm.toFixed(0)} Ω`} />
            <Metric label="Dissipation" value={(divider.pTotal * 1e3).toFixed(2)} unit="mW" detail={`R1 ${(divider.pR1 * 1e3).toFixed(2)} · R2 ${(divider.pR2 * 1e3).toFixed(2)}`} />
            <Metric label="Droop" value={divider.droopLsb.toFixed(3)} unit="LSB" tone={divider.droopOk ? "emerald" : "red"} detail={`Need ≥ ${(divider.cFiltMin * 1e9).toFixed(0)} nF`} />
            <Metric label="Settling" value={divider.settlingLsb.toFixed(3)} unit="LSB" tone={divider.settlingLsb < 0.5 ? "emerald" : "yellow"} />
            <Metric label="−3 dB" value={(divider.f3dbHz / 1e3).toFixed(2)} unit="kHz" />
          </div>
          <div className="mt-3 flex gap-2">
            <Flag ok={divider.droopOk}>Droop</Flag>
            <Flag ok={divider.settlingLsb < 0.5}>Settle</Flag>
            <Flag ok={divider.voutAtMax <= input.vref}>In range</Flag>
          </div>
        </Panel>
        <Panel eyebrow="−20 °C to 125 °C" title="ADC counts and resolution">
          <div className="h-72 w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="temp" tick={{ fill: "#8b97a8", fontSize: 11 }} unit=" °C" />
                  <YAxis yAxisId="c" tick={{ fill: "#8b97a8", fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: "#8b97a8", fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="c" type="monotone" dataKey="counts" name="Counts" stroke="#06b6d4" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line yAxisId="r" type="monotone" dataKey="cPerLsb" name="°C/LSB" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </Panel>
        <Panel eyebrow="Audit" title="Plugged-in equations">
          <Equation lines={lines} />
        </Panel>
        <Warnings
          items={[
            ...(divider.voutAtMax > input.vref ? ["The divider exceeds the ADC reference at the stated full-scale input."] : []),
            ...(!divider.droopOk ? ["Hold capacitor is too small for a 0.5 LSB charge droop."] : []),
            ...(analog.ntc.betaMatchesSteinhart ? [] : ["Steinhart–Hart coefficients do not reproduce 25 °C on the beta curve."])
          ]}
        />
      </div>
    </div>
  );
}
