"use client";

import { Equation, Metric, NumberField, Panel, SelectField, Warnings } from "@/components/ui";
import { useWorkbench } from "@/context/WorkbenchContext";
import { STACKUPS, THERMAL_PACKAGES } from "@/lib/engineering/pcb";
import type { StackupId, ThermalPackageId } from "@/lib/types";

export function PcbStudio() {
  const { project, pcb, setPcb, setRegulator } = useWorkbench();
  const input = project.pcb;
  const lines = [
    `External width for ${input.currentA.toFixed(2)} A at ${input.riseC.toFixed(0)} °C, ${input.oz} oz: ${pcb.externalWidthMm.toFixed(2)} mm`,
    `Internal width: ${pcb.internalWidthMm.toFixed(2)} mm`,
    `One ${input.viaDrillMm.toFixed(1)} mm via at 0.5 °C carries ${pcb.viaOneA.toFixed(2)} A (internal IPC-2152 on the barrel)`,
    `Vias for ${input.iPeak.toFixed(2)} A: ${pcb.viaCount}`,
    `L_via = 2e-7·h·(ln(4h/d)+1) = ${(pcb.viaLSingleH * 1e9).toFixed(3)} nH, parallel ${(pcb.viaLParallelH * 1e12).toFixed(1)} pH`,
    `R_via = h/(k·π·d·t) = ${pcb.thermal.rOne.toFixed(2)} °C/W, array of ${pcb.thermal.n} = ${pcb.thermal.rArray.toFixed(2)} °C/W`,
    `θJA = θJC + R_array + θ_plane = ${pcb.thermal.rjc.toFixed(1)} + ${pcb.thermal.rArray.toFixed(2)} + ${pcb.thermal.rPlane.toFixed(1)} = ${pcb.thermal.thetaJa.toFixed(2)} °C/W`,
    `USB 90 Ω: W ${(pcb.usb.wM * 1e3).toFixed(3)} mm, S ${(pcb.usb.sM * 1e3).toFixed(3)} mm, solved ${pcb.usb.zDiff.toFixed(2)} Ω`,
    `CAN 120 Ω: W ${(pcb.can.wM * 1e3).toFixed(3)} mm, S ${(pcb.can.sM * 1e3).toFixed(3)} mm, solved ${pcb.can.zDiff.toFixed(2)} Ω`,
    `50 Ω microstrip W ${(pcb.se50M * 1e3).toFixed(3)} mm (${pcb.se50Ohm.toFixed(2)} Ω)`,
    `50 Ω CPWG, 0.15 mm gap, W ${(pcb.cpwM * 1e3).toFixed(3)} mm (${pcb.cpwOhm.toFixed(2)} Ω)`
  ];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <Panel eyebrow="IPC-2152" title="Trace and via current">
          <div className="grid gap-4">
            <NumberField label="Current" unit="A" value={input.currentA} min={0.1} max={30} step={0.01} onChange={(currentA) => setPcb({ currentA })} />
            <NumberField label="Allowed rise" unit="°C" value={input.riseC} min={1} max={40} step={1} onChange={(riseC) => setPcb({ riseC })} />
            <SelectField
              label="Copper"
              value={String(input.oz)}
              onChange={(value) => setPcb({ oz: Number(value) as 0.5 | 1 | 2 })}
              options={[
                { value: "0.5", label: "0.5 oz" },
                { value: "1", label: "1 oz" },
                { value: "2", label: "2 oz" }
              ]}
            />
            <SelectField
              label="Via drill"
              value={String(input.viaDrillMm)}
              onChange={(value) => setPcb({ viaDrillMm: Number(value) })}
              options={[
                { value: "0.3", label: "0.3 mm" },
                { value: "0.6", label: "0.6 mm" }
              ]}
            />
            <NumberField label="Via-field current" unit="A" value={input.iPeak} min={0.2} max={40} step={0.1} onChange={(iPeak) => setPcb({ iPeak })} />
            <NumberField label="Via plating" unit="µm" value={input.platingUm} min={12} max={70} step={1} onChange={(platingUm) => setPcb({ platingUm })} />
          </div>
        </Panel>
        <Panel eyebrow="Exposed pad" title="Thermal via array">
          <div className="grid gap-4">
            <SelectField
              label="Stackup"
              value={input.stackupId}
              onChange={(stackupId) => setPcb({ stackupId: stackupId as StackupId })}
              options={STACKUPS.map((stack) => ({ value: stack.id, label: stack.label }))}
            />
            <SelectField
              label="Grid"
              value={String(input.grid)}
              onChange={(value) => setPcb({ grid: Number(value) as 3 | 4 | 5 })}
              options={[
                { value: "3", label: "3 × 3" },
                { value: "4", label: "4 × 4" },
                { value: "5", label: "5 × 5" }
              ]}
            />
            <SelectField
              label="Package"
              value={input.thermalPackage}
              onChange={(thermalPackage) => setPcb({ thermalPackage: thermalPackage as ThermalPackageId })}
              options={(Object.keys(THERMAL_PACKAGES) as ThermalPackageId[]).map((id) => ({
                value: id,
                label: THERMAL_PACKAGES[id].label
              }))}
            />
            <NumberField label="Plane to ambient" unit="°C/W" value={input.rPlane} min={5} max={80} step={0.5} onChange={(rPlane) => setPcb({ rPlane })} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{pcb.stack.note}</p>
          <button
            type="button"
            className="mt-3 rounded-md border border-amber-400/30 px-2 py-1 text-xs text-amber-200"
            onClick={() => setRegulator({ rthOverride: Math.round(pcb.thermal.thetaJa * 10) / 10 })}
          >
            Push {pcb.thermal.thetaJa.toFixed(1)} °C/W into the regulator
          </button>
        </Panel>
      </div>
      <div className="space-y-4 xl:col-span-7">
        <Panel eyebrow="Copper" title="Width, stitching, array">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="External" value={pcb.externalWidthMm.toFixed(2)} unit="mm" tone="amber" detail={`Rise ${pcb.externalRise.toFixed(2)} °C`} />
            <Metric label="Internal" value={pcb.internalWidthMm.toFixed(2)} unit="mm" detail={`Rise ${pcb.internalRise.toFixed(2)} °C`} />
            <Metric label="Vias" value={String(pcb.viaCount)} unit={`× ${input.viaDrillMm} mm`} tone="cyan" detail={`${pcb.viaOneA.toFixed(2)} A each at 0.5 °C`} />
            <Metric label="Via L" value={(pcb.viaLParallelH * 1e9).toFixed(3)} unit="nH" detail="Parallel, with mutual" />
            <Metric label="θJA array" value={pcb.thermal.thetaJa.toFixed(2)} unit="°C/W" tone="emerald" detail={`${pcb.thermal.n} vias · ${pcb.thermal.rArray.toFixed(2)} °C/W`} />
            <Metric label="USB W / S" value={`${(pcb.usb.wM * 1e3).toFixed(2)} / ${(pcb.usb.sM * 1e3).toFixed(2)}`} unit="mm" tone="cyan" detail={`${pcb.usb.zDiff.toFixed(1)} Ω`} />
            <Metric label="CAN W / S" value={`${(pcb.can.wM * 1e3).toFixed(2)} / ${(pcb.can.sM * 1e3).toFixed(2)}`} unit="mm" detail={`${pcb.can.zDiff.toFixed(1)} Ω`} />
            <Metric label="50 Ω RF" value={(pcb.cpwM * 1e3).toFixed(2)} unit="mm" detail={`CPWG ${pcb.cpwOhm.toFixed(1)} Ω · microstrip ${(pcb.se50M * 1e3).toFixed(2)} mm`} />
          </div>
        </Panel>
        <Panel eyebrow="Audit" title="Plugged-in equations">
          <Equation lines={lines} />
        </Panel>
        <Warnings items={pcb.warnings} />
      </div>
    </div>
  );
}
