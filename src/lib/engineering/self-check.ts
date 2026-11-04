import { formatEditable } from "../format";
import { analyzeCan } from "./can";
import { analyzeCapacitance } from "./capacitance";
import { COPPER_1OZ_MILS, temperatureRiseC, widthMilsForRise } from "./ipc2152";
import { analyzePower } from "./power";
import { analyzeRegulator } from "./regulator";
import { createProject, PRESET } from "../preset";

let failures = 0;

function check(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function near(actual: number, expected: number, tol: number, message: string): void {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${message} (actual ${actual}, expected ${expected} ± ${tol})`);
  }
}

check(formatEditable(10, 0) === "10", "integer 10 stays 10");
check(formatEditable(80, 0) === "80", "integer 80 stays 80");
check(formatEditable(2500, 2) === "2500", "2500.00 trims to 2500");
check(formatEditable(0.04, 2) === "0.04", "0.04 keeps its significant zero");
check(formatEditable(12.5, 1) === "12.5", "12.5 stays 12.5");

const width1A = widthMilsForRise(1, 10, "external");
near(width1A, 10.91, 0.08, "1 A / 10 °C / 1 oz external width");
near(temperatureRiseC(1, width1A, "external"), 10, 1e-6, "external IPC-2152 round trip");
const widthInternal = widthMilsForRise(2, 20, "internal");
near(temperatureRiseC(2, widthInternal, "internal"), 20, 1e-6, "internal 1 oz IPC-2152 round trip");
check(COPPER_1OZ_MILS > 1.37 && COPPER_1OZ_MILS < 1.38, "1 oz thickness is 35 µm");
check(widthMilsForRise(3, 10, "external") > width1A, "trace width grows with current");

const project = createProject();
const power = analyzePower(project.rails, project.loads, project.traceRiseC);
for (const scenario of ["idle", "active", "mission", "peak"] as const) {
  near(power.scenarios[scenario].balanceErrorW, 0, 1e-6, `${scenario} power balance`);
  check(Number.isFinite(power.scenarios[scenario].inputPowerW), `${scenario} input power is finite`);
}
check(power.scenarios.idle.inputPowerW < power.scenarios.active.inputPowerW, "idle draws less than active");
check(power.scenarios.active.inputPowerW < power.scenarios.mission.inputPowerW, "burst energy raises mission power above active");
check(power.scenarios.peak.inputPeakA > power.scenarios.mission.inputRmsA, "coincident peak exceeds mission RMS");
check(power.fuse.ratingA + 1e-9 >= power.fuse.minRatingA || power.fuse.ratingA === 60, "fuse meets the 75% rule");
check(power.warnings.every((warning) => !warning.toLowerCase().includes("cycle")), "preset has no cycle");
const rail3v3 = power.rails.find((rail) => rail.id === "rail3v3");
check(!!rail3v3, "3.3 V rail exists");
near(project.regulator.iout, Math.round((rail3v3?.out.mission.iRmsA ?? 0) * 1000) / 1000, 1e-9, "regulator preload matches 3.3 V mission RMS");
check(Math.abs((rail3v3?.lossW.mission ?? 0) - ((5 - 3.3) * (rail3v3?.out.mission.iAvgA ?? 0) + 5 * 0.00004)) < 1e-6, "LDO loss identity");

const ldo = analyzeRegulator({
  ...PRESET.regulator,
  architecture: "ldo",
  vin: 5,
  vout: 3.3,
  iout: 0.2,
  iqMa: 0,
  ta: 40,
  rthOverride: null,
  packageId: "SOT-223"
});
near(ldo.terms[0]?.watts ?? NaN, 0.34, 1e-12, "LDO pass loss");
near(ldo.efficiencyPct, 66, 0.05, "LDO efficiency");
near(ldo.tj, 40 + 0.34 * 62, 1e-9, "LDO junction temperature");

const buck = analyzeRegulator({
  ...PRESET.regulator,
  architecture: "buck",
  vin: 24,
  vout: 5,
  iout: 0.8,
  iqMa: 0.15,
  ta: 40,
  packageId: "QFN",
  rthOverride: null,
  fswKhz: 2100,
  rdsHsMo: 90,
  rdsLsMo: 45,
  trNs: 4,
  tfNs: 4,
  tDeadNs: 20,
  vsd: 0.7,
  dcrMo: 22,
  qgNc: 3.5,
  vdrive: 5
});
const duty = 5 / 24;
const pCond = 0.64 * (duty * 0.09 + (1 - duty) * 0.045);
const pSw = 0.5 * 24 * 0.8 * (8e-9) * 2.1e6;
const pDead = 0.7 * 0.8 * 20e-9 * 2.1e6;
const pGate = 3.5e-9 * 5 * 2.1e6;
const pIq = 24 * 0.00015;
const pDcr = 0.64 * 0.022;
near(buck.terms.find((term) => term.id === "cond")?.watts ?? NaN, pCond, 1e-9, "buck conduction");
near(buck.terms.find((term) => term.id === "sw")?.watts ?? NaN, pSw, 1e-9, "buck switching");
near(buck.terms.find((term) => term.id === "dead")?.watts ?? NaN, pDead, 1e-9, "buck dead time");
near(buck.terms.find((term) => term.id === "gate")?.watts ?? NaN, pGate, 1e-9, "buck gate");
near(buck.terms.find((term) => term.id === "dcr")?.watts ?? NaN, pDcr, 1e-9, "buck DCR");
near(buck.pPackageW, pCond + pSw + pDead + pGate + pIq, 1e-9, "buck package loss");
near(buck.tj, 40 + buck.pPackageW * 35, 1e-9, "buck Tj uses package loss only");
check(buck.efficiencyPct > 90 && buck.efficiencyPct < 98, "buck efficiency is in a credible band");

const cap = analyzeCapacitance(PRESET.capacitance);
check(cap.valid && cap.boundary !== null, "capacitance model returns a boundary");
near(cap.esrMaxOhm, (0.35 * 0.2) / 2, 1e-12, "ESR budget");
check(cap.cMinF > 30e-6 && cap.cMinF < 3000e-6, `Cmin is plausible (${(cap.cMinF * 1e6).toFixed(1)} µF)`);
near(cap.boundary?.vMin ?? NaN, cap.vBrownout, 0.003, "boundary droop sits on the brownout line");
check(!!cap.recommended, "catalog returns a buildable combination");
check(
  !!cap.recommended && cap.recommended.polymerCount === 1 && cap.recommended.mlccCount >= 2 && cap.recommended.mlccEachF >= 22e-6,
  `recommended bank is one polymer plus 22µF ceramics (${cap.recommended?.description ?? "none"})`
);
check((cap.recommendedSim?.vMin ?? 0) >= cap.vBrownout - 0.002, "recommended network stays above brownout");
const tighter = analyzeCapacitance({ ...PRESET.capacitance, dropMv: 100 });
check(tighter.cMinF > cap.cMinF, "halving the allowed droop increases capacitance");

const can = analyzeCan(PRESET.can);
check(can.timing.solvable, "500 kbit/s timing solves");
near(can.timing.ppm, 0, 1e-6, "500 kbit/s baud error");
near(can.timing.prescaler, 8, 0, "prescaler");
near(can.timing.nTq, 20, 0, "time quanta");
near(can.timing.seg1, 15, 0, "time seg 1");
near(can.timing.seg2, 4, 0, "time seg 2");
near(can.timing.samplePoint, 0.8, 1e-12, "sample point");
near(can.termination.cutoffHz ?? NaN, 1 / (2 * Math.PI * 30 * 4.7e-9), 1, "split-termination cutoff");
near(can.termination.powerTypicalW, (1 * 1) / 60, 1e-12, "split resistor dissipation at 2 V differential");
check(can.rows.length === 4, "four CAN rates");
check(can.rows.every((row) => row.limit.maxStubM === 0.3), "stub guideline is 0.3 m");
const selected = can.rows.find((row) => row.selected);
check(!!selected && selected.busOk && selected.stubOk && selected.timingOk, "preset CAN design passes");

const active = power.scenarios.active.inputPowerW;
const idle = power.scenarios.idle.inputPowerW;
const mission = power.scenarios.mission.inputPowerW;
console.log(
  [
    `Active ${active.toFixed(3)} W`,
    `Idle ${idle.toFixed(3)} W`,
    `Mission ${mission.toFixed(3)} W`,
    `Peak ${power.scenarios.peak.inputPeakA.toFixed(3)} A`,
    `Fuse ${power.fuse.ratingA} A`,
    `Trace ${power.sourceTrace.external.recommendedMm.toFixed(2)} mm`,
    `3V3 RMS ${project.regulator.iout.toFixed(3)} A`,
    `Tj ${analyzeRegulator(project.regulator).tj.toFixed(1)} C`,
    `Cmin ${(cap.cMinF * 1e6).toFixed(1)} uF`,
    `Combo ${cap.recommended?.description ?? "none"}`
  ].join(" | ")
);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("All engineering checks passed.");
