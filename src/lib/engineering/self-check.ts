import { formatEditable } from "../format";
import { createProject, PRESET } from "../preset";
import { ldoDissipation, partById } from "../components-db";
import { altiumDelphiScript, altiumJavaScript } from "../altium-script";
import { altiumRulesCsv, bomCsv, ltspiceCir } from "../exporters";
import { E96, analyzeDivider, cFiltMinF, chargeDroopLsb, nearestInSeries, ntcResistance, steinhartTemperatureC, betaToSteinhart } from "./analog";
import { analyzeCan } from "./can";
import { analyzeCapacitance } from "./capacitance";
import { fuseMeltI2t, loopResistanceOhm, wireDropV, wireI2t } from "./harness";
import { COPPER_1OZ_MILS, temperatureRiseC, widthMilsForRise } from "./ipc2152";
import { analyzeInductor, igseSineWPerM3, mlccDcRetention, requiredInductanceH, steinmetzSineWPerM3 } from "./magnetics";
import { analyzePcb, differentialOhm, internalOneOzMatchesLegacy, microstripOhm, viaThermalResistance, widthMmForRise } from "./pcb";
import { analyzePower } from "./power";
import { analyzeProtection, characteristicOhm, filterCutoffHz } from "./protection";
import { analyzeRegulator } from "./regulator";

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

const lm5164 = partById("LM5164");
check(!!lm5164 && lm5164.category === "buck" && lm5164.vinMax === 100 && lm5164.ioutMax === 1, "LM5164 is the 100 V 1 A buck");
const ams = partById("AMS1117-3.3");
check(!!ams && ams.category === "ldo" && ams.dropoutDanger && ams.vdoMax >= 1.2, "AMS1117 is flagged for high dropout");
if (ams && ams.category === "ldo") {
  const hot = ldoDissipation(ams, 5, 0.8);
  near(hot.pPass, (5 - 3.3) * 0.8, 1e-12, "AMS1117 pass loss from 5 V at 0.8 A");
  check(hot.dropoutDanger, "AMS1117 stays flagged as a dropout hazard");
  check(5 - 3.3 - ams.vdoMax < 0.5, "the 1.3 V maximum dropout leaves under 0.5 V on a 5 V to 3.3 V rail");
}
const vnq = partById("VNQ7050AJ");
check(!!vnq && vnq.category === "high-side" && vnq.rds150Ohm > vnq.rds25Ohm && vnq.kilisTyp > 0 && vnq.tsdC >= 150, "VNQ7050AJ publishes hot RDS, KILIS and shutdown");

const lRequired = requiredInductanceH(24, 5, 1, 400e3, 0.3);
near(lRequired, ((24 - 5) * (5 / 24)) / (400e3 * 0.3), 1e-15, "buck inductance from volt-seconds");
const choke = analyzeInductor(24, 5, 1, 400e3, { ...PRESET.magnetics, inductorId: "sized", rippleFraction: 0.3, satMargin: 0.25 });
near(choke.iPeak, 1.15, 1e-12, "Ipeak is Iout plus half the ripple");
near(choke.iSatMin, 1.15 * 1.25, 1e-12, "Isat carries the 25% margin");
const sine = steinmetzSineWPerM3(1e5, 0.1);
near(igseSineWPerM3(1e5, 0.1), sine, sine * 1e-6, "iGSE reproduces the sine Steinmetz law");
const c0603 = 22e-6 * mlccDcRetention("0603", "X7R", 3.8, 6.3);
const c0805 = 22e-6 * mlccDcRetention("0805", "X7R", 3.8, 6.3);
const c1206 = 22e-6 * mlccDcRetention("1206", "X7R", 3.8, 6.3);
check(c0603 < 7e-6, "22 µF 6.3 V 0603 is under 7 µF at 3.8 V");
check(c0805 > c0603 && c1206 > c0805, "larger cases keep more capacitance at the same bias");

const shield = analyzeProtection(PRESET.protection);
near(shield.z0, Math.sqrt(PRESET.protection.lH / PRESET.protection.cF), 1e-12, "filter Z0");
near(shield.fcHz, filterCutoffHz(PRESET.protection.lH, PRESET.protection.cF), 1e-9, "filter cutoff");
near(shield.fcHz, 1 / (2 * Math.PI * Math.sqrt(PRESET.protection.lH * PRESET.protection.cF)), 1e-6, "cutoff closed form");
near(characteristicOhm(PRESET.protection.lH, PRESET.protection.cF), shield.z0, 1e-12, "characteristic impedance helper");
check(shield.peakRatio < 0.1 && shield.stable, "damped filter has 20 dB Middlebrook margin");
check(shield.tvs.pass && Math.abs(shield.tvs.marginV - (65 - 53.3)) < 1e-9, "SMBJ33A clamp sits 11.7 V under the LMR36520");
const bareFilter = analyzeProtection({ ...PRESET.protection, rdOhm: 0, cdF: 0 });
check(bareFilter.peakRatio > 0.1 && !bareFilter.stable, "undamped LC fails Middlebrook");
const weakBuck = analyzeProtection({ ...PRESET.protection, buckId: "MP2315" });
check(!weakBuck.tvs.clampOk && weakBuck.tvs.marginV < 0, "MP2315 cannot survive the SMBJ33A clamp");

near(loopResistanceOhm(2.5, 0.5, 20), (2 * 2.5 * 1.724e-8) / 0.5e-6, 1e-12, "round-trip copper resistance at 20 °C");
near(wireDropV(2, 2.5, 0.5, 20), 2 * loopResistanceOhm(2.5, 0.5, 20), 1e-12, "drop is current times loop resistance");
near(wireI2t(0.5, "pvc"), (115 * 0.5) ** 2, 1e-9, "PVC adiabatic I2t");
check(fuseMeltI2t(5) < wireI2t(0.5, "pvc"), "5 A fuse melts before 0.5 mm² PVC is damaged");
check(fuseMeltI2t(30) > wireI2t(0.25, "pvc"), "30 A fuse does not coordinate with 0.25 mm² PVC");

check(internalOneOzMatchesLegacy(20, 1.5), "1 oz internal IPC-2152 matches the legacy fit");
const w1 = widthMmForRise(1, 10, "external", 1);
const w2 = widthMmForRise(1, 10, "external", 2);
check(w2 < w1, "2 oz external copper is narrower than 1 oz for the same rise");
near(temperatureRiseC(1, w1 / 0.0254, "external"), 10, 1e-6, "external width inverts the 10 °C rise");
const pcb = analyzePcb(PRESET.pcb);
near(pcb.usb.zDiff, 90, 0.05, "USB pair solves to 90 ohm");
near(pcb.can.zDiff, 120, 0.05, "CAN pair solves to 120 ohm");
near(pcb.se50Ohm, 50, 0.05, "microstrip solves to 50 ohm");
near(pcb.cpwOhm, 50, 0.05, "coplanar waveguide solves to 50 ohm");
check(microstripOhm(0.4e-3, 0.21e-3, 4.6) < microstripOhm(0.2e-3, 0.21e-3, 4.6), "a wider microstrip has lower impedance");
check(differentialOhm(0.2e-3, 0.1e-3, 0.21e-3, 4.6) < differentialOhm(0.2e-3, 0.3e-3, 0.21e-3, 4.6), "a closer pair has lower differential impedance");
const rVia = viaThermalResistance(PRESET.pcb ? 0.21e-3 : 0.21e-3, 0.3e-3, 35e-6);
near(pcb.thermal.rArray, rVia / 16, 1e-9, "4x4 thermal vias divide the barrel resistance");
check(pcb.thermal.thetaJa < 35, "the via array pulls QFN θJA under the bare datasheet 35 °C/W");

const divider = analyzeDivider(PRESET.analog);
check(divider.droopLsb < 0.5, "default hold capacitor keeps charge droop under 0.5 LSB");
near(cFiltMinF(5e-12, 12, 0.5), 5e-12 * (4096 / 0.5 - 1), 1e-18, "minimum Cfilt for half an LSB");
near(chargeDroopLsb(3, 3.3, 12, 100e-9, 5e-12), (3 * 5e-12) / (100e-9 + 5e-12) / (3.3 / 4096), 1e-9, "charge-sharing droop in LSB");
check(E96.length === 96, "E96 has 96 mantissas");
check(nearestInSeries(10000, "E96") === 10000 && nearestInSeries(10200, "E96") === 10200, "E96 snaps exact values onto themselves");
near(ntcResistance(25, 10000, 3950, 25), 10000, 1e-6, "beta equation returns R0 at T0");
const sh = betaToSteinhart(10000, 3950, 25);
near(steinhartTemperatureC(10000, sh.a, sh.b, sh.c), 25, 1e-6, "Steinhart-Hart with C=0 matches the beta point");

const cir = ltspiceCir(PRESET);
check(cir.startsWith("*"), "LTspice deck starts with a title");
check(cir.includes(".tran 5m"), "LTspice deck runs a 5 ms transient");
check(cir.trimEnd().endsWith(".end"), "LTspice deck ends with .end");
check(cir.includes("PULSE(") && cir.includes("Vbat") && cir.includes("Bload"), "LTspice deck has the battery, the constant-power load and the LTE pulse");
const rules = altiumRulesCsv(PRESET);
const ruleLines = rules.trim().split("\n");
check(ruleLines[0] === "Rule,NetClass,Min_mm,Preferred_mm,Max_mm", "Altium CSV header");
check(["PWR_24V", "PWR_5V", "PWR_3V8_LTE", "PWR_3V3", "USB_90R", "CAN_120R"].every((name) => rules.includes(name)), "Altium rules name every power class and both differential pairs");
check(ruleLines.slice(1).every((line) => line.split(",").length === 5), "every Altium rule row has five columns");
const bom = bomCsv(PRESET);
check(bom.includes("LMR36520") && bom.includes("LM74700-Q1") && bom.includes("VNQ7050AJ"), "BOM carries the power-stage part numbers");
const pascal = altiumDelphiScript(PRESET);
check(pascal.includes("Procedure HWPS_ImportRules"), "DelphiScript exposes HWPS_ImportRules");
check(
  pascal.includes("eRule_MaxMinWidth") && pascal.includes("eRule_DiffPairsRouting") && pascal.includes("eRule_ComponentClearance"),
  "DelphiScript creates width, differential-pair, and component keep-out rules"
);
check(pascal.includes("CAN_120R") && pascal.includes("USB_90R") && pascal.includes("PWR_24V"), "DelphiScript names the power class and both pairs");
const javascript = altiumJavaScript(PRESET);
check(javascript.includes("function HWPS_ImportRules"), "JavaScript exposes HWPS_ImportRules");
check(javascript.includes("PCBRuleFactory") && javascript.includes("eRule_Clearance"), "JavaScript writes the PCB rule factory calls");

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
