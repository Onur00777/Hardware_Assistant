"use client";

import { useWorkbench } from "@/context/WorkbenchContext";
import { CAN_VELOCITY_M_PER_S } from "@/lib/engineering/can";
import type { CanBaud, CanMcu } from "@/lib/types";
import { Equation, Flag, Metric, NumberField, Panel, Segmented, SelectField, TinyButton, Warnings } from "@/components/ui";

function hz(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MHz`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} kHz`;
  return `${value.toFixed(0)} Hz`;
}

function Schematic({ split, capNf }: { split: boolean; capNf: number }) {
  if (!split) {
    return (
      <svg viewBox="0 0 420 120" className="h-28 w-full" role="img" aria-label="Single 120 ohm termination between CANH and CANL">
        <text x="16" y="28" fill="#8b97a8" fontSize="12" fontFamily="IBM Plex Mono, ui-monospace, monospace">CANH</text>
        <text x="16" y="96" fill="#8b97a8" fontSize="12" fontFamily="IBM Plex Mono, ui-monospace, monospace">CANL</text>
        <line x1="70" y1="24" x2="160" y2="24" stroke="#06b6d4" strokeWidth="2" />
        <line x1="70" y1="92" x2="160" y2="92" stroke="#06b6d4" strokeWidth="2" />
        <rect x="160" y="36" width="28" height="48" fill="none" stroke="#e7edf5" />
        <line x1="174" y1="24" x2="174" y2="36" stroke="#e7edf5" />
        <line x1="174" y1="84" x2="174" y2="92" stroke="#e7edf5" />
        <text x="198" y="66" fill="#06b6d4" fontSize="14" fontFamily="IBM Plex Mono, ui-monospace, monospace">120 Ω · 1%</text>
        <line x1="250" y1="24" x2="360" y2="24" stroke="#06b6d4" strokeWidth="2" />
        <line x1="250" y1="92" x2="360" y2="92" stroke="#06b6d4" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 460 160" className="h-36 w-full" role="img" aria-label="Split 60 ohm termination with a common-mode capacitor">
      <text x="12" y="28" fill="#8b97a8" fontSize="12" fontFamily="IBM Plex Mono, ui-monospace, monospace">CANH</text>
      <text x="12" y="92" fill="#8b97a8" fontSize="12" fontFamily="IBM Plex Mono, ui-monospace, monospace">CANL</text>
      <line x1="62" y1="24" x2="120" y2="24" stroke="#06b6d4" strokeWidth="2" />
      <line x1="62" y1="88" x2="120" y2="88" stroke="#06b6d4" strokeWidth="2" />
      <rect x="120" y="14" width="46" height="20" fill="none" stroke="#e7edf5" />
      <rect x="120" y="78" width="46" height="20" fill="none" stroke="#e7edf5" />
      <text x="128" y="28" fill="#06b6d4" fontSize="11" fontFamily="IBM Plex Mono, ui-monospace, monospace">60 Ω</text>
      <text x="128" y="92" fill="#06b6d4" fontSize="11" fontFamily="IBM Plex Mono, ui-monospace, monospace">60 Ω</text>
      <line x1="166" y1="24" x2="230" y2="24" stroke="#06b6d4" strokeWidth="2" />
      <line x1="166" y1="88" x2="230" y2="88" stroke="#06b6d4" strokeWidth="2" />
      <line x1="230" y1="24" x2="230" y2="88" stroke="#e7edf5" />
      <line x1="230" y1="56" x2="280" y2="56" stroke="#e7edf5" />
      <line x1="280" y1="46" x2="280" y2="66" stroke="#06b6d4" strokeWidth="2" />
      <line x1="288" y1="50" x2="288" y2="62" stroke="#06b6d4" strokeWidth="2" />
      <line x1="284" y1="66" x2="284" y2="96" stroke="#8b97a8" />
      <line x1="274" y1="96" x2="294" y2="96" stroke="#8b97a8" />
      <line x1="278" y1="100" x2="290" y2="100" stroke="#8b97a8" />
      <text x="300" y="54" fill="#06b6d4" fontSize="12" fontFamily="IBM Plex Mono, ui-monospace, monospace">{capNf.toFixed(1)} nF</text>
      <text x="300" y="100" fill="#8b97a8" fontSize="12" fontFamily="IBM Plex Mono, ui-monospace, monospace">GND</text>
      <text x="12" y="140" fill="#8b97a8" fontSize="11" fontFamily="IBM Plex Mono, ui-monospace, monospace">Differential 120 Ω. The capacitor shunts common mode only.</text>
    </svg>
  );
}

export function CanStudio() {
  const { project, can, setCan } = useWorkbench();
  const input = project.can;
  const timing = can.timing;
  const term = can.termination;
  const selected = can.rows.find((row) => row.selected);
  const clocks = [8, 16, 20, 40, 48, 80, 160];

  const lines = [
    `t_bit = 1 / ${input.baud} = ${timing.solvable ? timing.bitNs.toFixed(1) : "—"} ns`,
    timing.solvable
      ? `N_TQ = f_clk / (prescaler · baud) = ${Math.round(input.clockMhz * 1e6)} / (${timing.prescaler} · ${input.baud}) = ${timing.nTq}`
      : "No integer timing in the 8–25 TQ window.",
    timing.solvable
      ? `Sample = (1 + TSEG1) / N_TQ = (1 + ${timing.seg1}) / ${timing.nTq} = ${(timing.samplePoint * 100).toFixed(2)} %`
      : "",
    `t_required = 2 · (L / v + t_trx),  v = ${CAN_VELOCITY_M_PER_S.toExponential(1)} m/s (5 ns/m)`,
    selected
      ? `Margin = t_sample − t_required = ${selected.marginNs.toFixed(0)} ns`
      : "",
    term.mode === "split"
      ? `f_c = 1 / (2π · 30 Ω · C) = ${hz(term.cutoffHz)}    (60 Ω || 60 Ω = 30 Ω into the capacitor)`
      : "Single 120 Ω resistor. No common-mode capacitor on this topology.",
    term.perResistor
      ? `P_leg at 2.0 V differential = ((2/2)² / 60) = ${(term.powerTypicalW * 1000).toFixed(2)} mW each`
      : `P at 2.0 V differential = 2² / 120 = ${(term.powerTypicalW * 1000).toFixed(2)} mW`
  ].filter(Boolean);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <Panel eyebrow="Physical layer" title="Termination">
          <Segmented
            accent="cyan"
            label="Termination topology"
            value={input.termination}
            onChange={(termination) => setCan({ termination })}
            options={[
              { id: "standard", label: "120 Ω" },
              { id: "split", label: "60 + 60 Ω" }
            ]}
          />
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/30 px-2 py-2">
            <Schematic split={input.termination === "split"} capNf={input.splitCapNf} />
          </div>
          {input.termination === "split" ? (
            <div className="mt-4">
              <NumberField
                accent="#06b6d4"
                label="Common-mode capacitor"
                unit="nF"
                value={input.splitCapNf}
                min={1}
                max={100}
                step={0.1}
                onChange={(splitCapNf) => setCan({ splitCapNf })}
              />
              <div className="mt-2 flex gap-2">
                <TinyButton tone="cyan" onClick={() => setCan({ splitCapNf: 4.7 })}>
                  4.7 nF
                </TinyButton>
                <TinyButton tone="cyan" onClick={() => setCan({ splitCapNf: 10 })}>
                  10 nF
                </TinyButton>
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label={term.perResistor ? "Each leg" : "Resistor"} value={term.perResistor ? "60" : "120"} unit="Ω" tone="cyan" detail="1% or better, differential 120 Ω" />
            <Metric label="CM cutoff" value={term.cutoffHz ? hz(term.cutoffHz) : "—"} tone="cyan" detail={term.perResistor ? "30 Ω into the capacitor" : "No split capacitor"} />
            <Metric label="Power, 2 V diff" value={(term.powerTypicalW * 1000).toFixed(1)} unit="mW" detail={term.perResistor ? "Per 60 Ω leg, dominant" : "In the 120 Ω resistor"} />
            <Metric label="Power, 3 V diff" value={(term.powerWorstW * 1000).toFixed(1)} unit="mW" detail="Worst-case dominant. 100 mW parts are enough." />
          </div>
        </Panel>

        <Panel eyebrow="This node" title="Clock and geometry">
          <SelectField
            label="Bit rate"
            value={String(input.baud)}
            onChange={(value) => setCan({ baud: Number(value) as CanBaud })}
            options={[
              { value: "125000", label: "125 kbit/s" },
              { value: "250000", label: "250 kbit/s" },
              { value: "500000", label: "500 kbit/s" },
              { value: "1000000", label: "1 Mbit/s" }
            ]}
          />
          <div className="mt-3">
            <SelectField
              label="Controller"
              value={input.mcu}
              onChange={(mcu) => setCan({ mcu: mcu as CanMcu })}
              options={[
                { value: "fdcan", label: "STM32 FDCAN (H7)" },
                { value: "bxcan", label: "STM32 bxCAN (F4)" }
              ]}
            />
          </div>
          <div className="mt-4 grid gap-4">
            <NumberField accent="#06b6d4" label="CAN clock" unit="MHz" value={input.clockMhz} min={4} max={160} step={1} onChange={(clockMhz) => setCan({ clockMhz })} />
            <div className="flex flex-wrap gap-2">
              {clocks.map((clock) => (
                <TinyButton key={clock} tone="cyan" onClick={() => setCan({ clockMhz: clock })}>
                  {clock} MHz
                </TinyButton>
              ))}
            </div>
            <NumberField accent="#06b6d4" label="Target sample point" unit="%" value={input.samplePointPct} min={60} max={90} step={0.1} onChange={(samplePointPct) => setCan({ samplePointPct })} />
            <NumberField accent="#06b6d4" label="Bus length" unit="m" value={input.busLengthM} min={0.1} max={500} step={0.1} onChange={(busLengthM) => setCan({ busLengthM })} />
            <NumberField accent="#06b6d4" label="Longest stub" unit="m" value={input.stubLengthM} min={0} max={2} step={0.01} onChange={(stubLengthM) => setCan({ stubLengthM })} />
            <NumberField accent="#06b6d4" label="Transceiver delay, one way" unit="ns" value={input.trxDelayNs} min={40} max={400} step={1} hint="Typical ISO 11898 transceiver delay used in the round-trip budget." onChange={(trxDelayNs) => setCan({ trxDelayNs })} />
          </div>
        </Panel>
      </div>

      <div className="space-y-4 xl:col-span-7">
        <Panel eyebrow={can.mcuLabel} title="Bit timing">
          <div className="mb-3 flex flex-wrap gap-2">
            <Flag ok={!!selected?.busOk}>Bus {selected?.busOk ? "pass" : "fail"}</Flag>
            <Flag ok={!!selected?.stubOk}>Stub {selected?.stubOk ? "pass" : "fail"}</Flag>
            <Flag ok={!!selected?.timingOk}>Sample {selected?.timingOk ? "pass" : "fail"}</Flag>
            <Flag ok={timing.solvable && timing.ppm < 50}>Baud {timing.solvable ? `${timing.ppm.toFixed(0)} ppm` : "fail"}</Flag>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Prescaler" value={timing.solvable ? String(timing.prescaler) : "—"} tone="cyan" />
            <Metric label="Time quanta" value={timing.solvable ? String(timing.nTq) : "—"} tone="cyan" detail={timing.solvable ? `${timing.tqNs.toFixed(1)} ns each` : ""} />
            <Metric label="TSEG1 / TSEG2" value={timing.solvable ? `${timing.seg1} / ${timing.seg2}` : "—"} detail="Sync segment is 1 TQ" />
            <Metric label="SJW" value={timing.solvable ? String(timing.sjw) : "—"} detail="Min of the controller cap and TSEG2" />
            <Metric label="Sample point" value={timing.solvable ? (timing.samplePoint * 100).toFixed(2) : "—"} unit="%" tone="cyan" />
            <Metric label="Bit time" value={timing.solvable ? timing.bitNs.toFixed(0) : "—"} unit="ns" />
            <Metric label="Sample at" value={timing.solvable ? timing.sampleNs.toFixed(0) : "—"} unit="ns" />
            <Metric label="Timing bus limit" value={selected ? selected.timingMaxBusM.toFixed(1) : "—"} unit="m" detail="From sample point and transceiver delay" />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            These are time-quanta counts. STM32 HAL NominalTimeSeg1, TimeSeg2, and SyncJumpWidth take these counts and subtract one when they write the register. Search prefers exact baud, then the sample point closest to the target, then 16 TQ.
          </p>
        </Panel>

        <Panel eyebrow="ISO 11898-2" title="Rate, bus, and stub">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="py-1 font-normal">Rate</th>
                  <th className="py-1 font-normal">Bit</th>
                  <th className="py-1 font-normal">Sample</th>
                  <th className="py-1 font-normal">ISO bus</th>
                  <th className="py-1 font-normal">Stub</th>
                  <th className="py-1 font-normal">This bus</th>
                  <th className="py-1 font-normal">Margin</th>
                </tr>
              </thead>
              <tbody>
                {can.rows.map((row) => (
                  <tr key={row.limit.baud} className={row.selected ? "bg-cyan-400/[0.06] text-slate-100" : "text-slate-400"}>
                    <td className="py-1.5 pr-2 font-mono">{row.limit.label}</td>
                    <td className="py-1.5 pr-2 font-mono">{row.timing.solvable ? `${row.timing.bitNs.toFixed(0)} ns` : "—"}</td>
                    <td className="py-1.5 pr-2 font-mono">{row.timing.solvable ? `${(row.timing.samplePoint * 100).toFixed(1)}%` : "—"}</td>
                    <td className="py-1.5 pr-2 font-mono">{row.limit.maxBusM} m</td>
                    <td className="py-1.5 pr-2 font-mono">{row.limit.maxStubM.toFixed(1)} m</td>
                    <td className="py-1.5 pr-2">{row.busOk && row.stubOk ? "pass" : "fail"}</td>
                    <td className="py-1.5 font-mono">{row.timing.solvable ? `${row.marginNs.toFixed(0)} ns` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Bus length is the conservative ISO 11898-2 column, 25 m at 1 Mbit/s. The stub column is the 0.3 m multi-drop guideline at every high-speed rate. A one-way stub of {input.stubLengthM.toFixed(2)} m is {(input.stubLengthM / CAN_VELOCITY_M_PER_S * 1e9).toFixed(2)} ns on this cable. The margin column is your sample instant minus the round trip of the entered bus length plus {input.trxDelayNs.toFixed(0)} ns of transceiver delay each way.
          </p>
        </Panel>

        <Panel eyebrow="Audit" title="Plugged-in equations">
          <Equation lines={lines} />
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Split termination keeps 120 Ω differentially and gives common-mode noise a capacitor to ground. Match the two 60 Ω parts. A common-mode choke is a separate part and is not sized here. Average dissipation is about half the dominant-bit figure if the bus is dominant half the time.
          </p>
        </Panel>
        <Warnings items={can.warnings} />
      </div>
    </div>
  );
}
