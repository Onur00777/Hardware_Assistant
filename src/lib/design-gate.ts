import { analyzeAnalog, type AnalogResult } from "./engineering/analog";
import { analyzeCan, type CanResult } from "./engineering/can";
import { analyzeCapacitance, type CapacitanceResult } from "./engineering/capacitance";
import { analyzeHarness, type HarnessResult } from "./engineering/harness";
import { analyzeInductor } from "./engineering/magnetics";
import { analyzePcb, type PcbResult } from "./engineering/pcb";
import { analyzePower, BLADE_FUSES_A, type PowerResult } from "./engineering/power";
import { analyzeProtection, type ProtectionResult } from "./engineering/protection";
import { analyzeRegulator, thermalZone, type RegulatorResult } from "./engineering/regulator";
import type { StudioToolId } from "./studio-nav";
import type { Project } from "./types";

export type GateStatus = "pass" | "watch" | "fail";

export interface GateCheck {
  id: string;
  label: string;
  detail: string;
  status: GateStatus;
  tool: StudioToolId;
}

export interface DesignGate {
  status: GateStatus;
  checks: GateCheck[];
  passed: number;
  failed: number;
  watching: number;
}

export interface DesignGateInput {
  project: Project;
  power: PowerResult;
  regulator: RegulatorResult;
  capacitance: CapacitanceResult;
  protection: ProtectionResult;
  harness: HarnessResult;
  pcb: PcbResult;
  analog: AnalogResult;
  can: CanResult;
}

function check(id: string, label: string, detail: string, status: GateStatus, tool: StudioToolId): GateCheck {
  return { id, label, detail, status, tool };
}

function overall(checks: GateCheck[]): GateStatus {
  if (checks.some((item) => item.status === "fail")) return "fail";
  if (checks.some((item) => item.status === "watch")) return "watch";
  return "pass";
}

/**
 * Release checklist. Every row reuses a result the studios already compute.
 * Fail blocks release. Watch is inside the hard limit and still worth a look.
 */
export function designGate(input: DesignGateInput): DesignGate {
  const { project, power, regulator, capacitance, protection, harness, pcb, analog, can } = input;
  const checks: GateCheck[] = [];
  const fuseCeiling = BLADE_FUSES_A[BLADE_FUSES_A.length - 1] ?? 60;
  const fuseMeetsRule = power.fuse.ratingA + 1e-9 >= power.fuse.minRatingA || power.fuse.ratingA === fuseCeiling;
  checks.push(
    check(
      "fuse",
      "Input fuse",
      `${power.fuse.ratingA} A blade, mission RMS at ${power.fuse.loadingPct.toFixed(0)}% of rating`,
      !fuseMeetsRule ? "fail" : power.fuse.peakExceedsRating ? "watch" : "pass",
      "power"
    )
  );

  const railProblems = power.rails.flatMap((rail) => rail.problems);
  checks.push(
    check(
      "rails",
      "Rail tree",
      railProblems.length > 0 ? railProblems.join(" ") : "Every converter has a parent and headroom.",
      railProblems.length > 0 ? "fail" : "pass",
      "power"
    )
  );

  const balanceFail = (["idle", "active", "mission", "peak"] as const).some((scenario) => Math.abs(power.scenarios[scenario].balanceErrorW) > 1e-3);
  checks.push(
    check(
      "balance",
      "Power balance",
      `Mission input ${power.scenarios.mission.inputPowerW.toFixed(2)} W`,
      balanceFail ? "fail" : "pass",
      "power"
    )
  );

  const zone = regulator.valid ? thermalZone(regulator.tj) : thermalZone(Number.NaN);
  checks.push(
    check(
      "regulator",
      "Regulator junction",
      regulator.valid ? `${regulator.tj.toFixed(1)} °C, ${zone.label.toLowerCase()}` : "Inputs are outside the regulating region.",
      !regulator.valid || zone.id === "shutdown" ? "fail" : zone.id === "derate" ? "watch" : "pass",
      "thermal"
    )
  );

  if (project.regulator.architecture === "buck") {
    const magnetics = analyzeInductor(
      project.regulator.vin,
      project.regulator.vout,
      project.regulator.iout,
      project.regulator.fswKhz * 1e3,
      project.magnetics
    );
    checks.push(
      check(
        "inductor",
        "Buck inductor",
        magnetics.valid ? `${(magnetics.lH * 1e6).toFixed(2)} µH, Isat at least ${magnetics.iSatMin.toFixed(2)} A` : "No continuous-conduction point.",
        magnetics.valid ? "pass" : "fail",
        "thermal"
      )
    );
  }

  const sag = capacitance.recommendedSim ? (capacitance.recommendedSim.vMin - capacitance.vBrownout) * 1e3 : Number.NaN;
  const bulkFail = !capacitance.valid || !capacitance.recommended || (capacitance.recommendedSim !== null && capacitance.recommendedSim.vMin + 1e-9 < capacitance.vBrownout);
  checks.push(
    check(
      "bulk",
      "Bulk hold-up",
      capacitance.recommended
        ? `${capacitance.recommended.description}, droop margin ${sag.toFixed(0)} mV`
        : "No catalog network holds brownout.",
      bulkFail ? "fail" : "pass",
      "bulk"
    )
  );

  checks.push(
    check(
      "tvs",
      "TVS clamp",
      protection.tvs.pass
        ? `${protection.tvs.part.id} stands off and clamps ${protection.tvs.marginV.toFixed(1)} V under the buck limit`
        : `${protection.tvs.part.id} does not cover standoff, clamp, energy, or pulse current`,
      protection.tvs.pass ? "pass" : "fail",
      "protect"
    )
  );

  checks.push(
    check(
      "middlebrook",
      "Input filter",
      `Peak |Zout|/|Zin| = ${protection.peakRatio.toFixed(3)}`,
      protection.stable ? "pass" : "fail",
      "protect"
    )
  );

  if (harness.channels.length === 0) {
    checks.push(check("harness", "Harness", "No high-side channels are defined.", "watch", "harness"));
  }
  for (const row of harness.channels) {
    const failed = !row.fuseCoordinates || !row.thermalOk || !row.dropOk;
    checks.push(
      check(
        `harness-${row.channel.id}`,
        row.channel.name,
        `Drop ${row.dropV.toFixed(3)} V, wire ${row.wireRiseC.toFixed(0)} °C, fuse I²t ${row.fuseCoordinates ? "under" : "over"} the wire`,
        failed ? "fail" : "pass",
        "harness"
      )
    );
  }

  const usbOff = Math.abs(pcb.usb.zDiff - 90) > 1;
  const canOff = Math.abs(pcb.can.zDiff - 120) > 1;
  const pour = pcb.externalWidthMm > 5;
  checks.push(
    check(
      "pcb",
      "PCB impedance",
      `USB ${pcb.usb.zDiff.toFixed(1)} Ω, CAN ${pcb.can.zDiff.toFixed(1)} Ω, external ${pcb.externalWidthMm.toFixed(2)} mm`,
      usbOff || canOff ? "fail" : pour ? "watch" : "pass",
      "pcb"
    )
  );

  const divider = analog.divider;
  checks.push(
    check(
      "adc",
      "ADC sampling",
      `Charge droop ${divider.droopLsb.toFixed(2)} LSB, settling ${divider.settlingLsb.toFixed(2)} LSB`,
      !divider.droopOk ? "fail" : divider.settlingLsb >= 0.5 ? "watch" : "pass",
      "analog"
    )
  );

  const selected = can.rows.find((row) => row.selected);
  const canFail = !can.timing.solvable || Math.abs(can.timing.ppm) >= 50 || !selected?.busOk || !selected?.stubOk || !selected?.timingOk;
  checks.push(
    check(
      "can",
      "CAN physical layer",
      can.timing.solvable ? `${can.timing.ppm.toFixed(0)} ppm, sample ${(can.timing.samplePoint * 100).toFixed(1)}%` : "No bit timing fits this clock.",
      canFail ? "fail" : "pass",
      "can"
    )
  );

  return {
    status: overall(checks),
    checks,
    passed: checks.filter((item) => item.status === "pass").length,
    failed: checks.filter((item) => item.status === "fail").length,
    watching: checks.filter((item) => item.status === "watch").length
  };
}

export function evaluateDesignGate(project: Project): DesignGate {
  return designGate({
    project,
    power: analyzePower(project.rails, project.loads, project.traceRiseC),
    regulator: analyzeRegulator(project.regulator),
    capacitance: analyzeCapacitance(project.capacitance),
    protection: analyzeProtection(project.protection),
    harness: analyzeHarness(project.harness),
    pcb: analyzePcb(project.pcb),
    analog: analyzeAnalog(project.analog),
    can: analyzeCan(project.can)
  });
}

export function formatDesignGate(gate: DesignGate, name: string): string {
  const verdict = gate.status === "pass" ? "RELEASE" : gate.status === "watch" ? "WATCH" : "HOLD";
  const lines = [
    `HardwarePowerStudio design gate — ${verdict}`,
    name,
    `${gate.failed} fail, ${gate.watching} watch, ${gate.passed} pass`,
    ""
  ];
  for (const item of gate.checks) {
    const mark = item.status === "pass" ? "PASS" : item.status === "watch" ? "WATCH" : "FAIL";
    lines.push(`${mark}  ${item.label} — ${item.detail}`);
  }
  return lines.join("\n");
}
