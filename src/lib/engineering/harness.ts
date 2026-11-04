/**
 * High-side switch thermal model and wire-harness coordination.
 *
 * Package: the exposed pad is treated as isothermal, which matches a PowerSSO
 * or TSDSO slug.
 *   Tj = Ta + θJA · Σ P_channel
 *   P_channel = I² · RDS(Tj)
 * RDS is linear between the 25 °C and 150 °C datasheet typicals. Tj and RDS
 * are solved by fixed-point iteration.
 *
 * Inrush uses a two-time-constant impedance
 *   Zth(t) = RθJC·(1−e^(−t/τdie)) + (θJA−RθJC)·(1−e^(−t/τboard))
 * and ΔT = P_pulse · Zth(t). Capacitive energy in the FET is ½ C V², delivered
 * while the current limit charges the capacitor in t = C V / I_limit.
 *
 * Sense resistor, worst-case (smallest KILIS, largest sense current):
 *   R_sense,max = V_adc,max · KILIS,min / I_limit
 * The recommended value is 80% of that, so a fault still lands under 3.3 V.
 * The series resistor into the MCU pin holds injected current at 0.5 mA if the
 * sense node is dragged up to the battery:
 *   R_series = (V_rail − 3.3) / 0.0005
 *
 * Wire: ρ(20 °C) = 1.724×10⁻⁸ Ω·m, α = 0.00393 /°C.
 *   R_loop = 2 · length · ρ(T) / area
 *   V_drop = I · R_loop
 * Temperature rise uses natural convection, h = 12 W/m²·K, on a thin-wall
 * insulation 0.30 mm thick:
 *   ΔT = I² R_per_m / (h · π · d_outer)
 * Insulation damage I²t is the IEC 60364 adiabatic limit k² S²,
 * k = 115 for PVC copper and k = 143 for XLPE copper, S in mm².
 * Coordination passes when the fuse melting I²t is strictly below that limit.
 */

import { highSideById, rdsAtTemperature, type HighSidePart } from "../components-db";
import type { HarnessChannel, HarnessInput } from "../types";

export const RHO_CU_20 = 1.724e-8;
export const ALPHA_CU = 0.00393;
export const WIRE_H_W_M2K = 12;
export const INSULATION_WALL_M = 0.3e-3;
export const ADC_INJECT_A = 0.0005;

export const INSULATION_K = { pvc: 115, xlpe: 143 } as const;

/** Typical mini/ATO melting I²t used for coordination. Confirm on the fuse curve. */
export const FUSE_MELT_I2T: { ratingA: number; i2t: number }[] = [
  { ratingA: 1, i2t: 0.8 },
  { ratingA: 2, i2t: 3.5 },
  { ratingA: 3, i2t: 9 },
  { ratingA: 4, i2t: 16 },
  { ratingA: 5, i2t: 28 },
  { ratingA: 7.5, i2t: 70 },
  { ratingA: 10, i2t: 140 },
  { ratingA: 15, i2t: 340 },
  { ratingA: 20, i2t: 650 },
  { ratingA: 25, i2t: 1100 },
  { ratingA: 30, i2t: 1700 }
];

export interface WireGauge {
  id: string;
  label: string;
  areaMm2: number;
  awg: string;
}

export const WIRE_GAUGES: WireGauge[] = [
  { id: "0.25", label: "0.25 mm²", areaMm2: 0.25, awg: "24" },
  { id: "0.35", label: "0.35 mm²", areaMm2: 0.35, awg: "22" },
  { id: "0.50", label: "0.50 mm²", areaMm2: 0.5, awg: "20" },
  { id: "0.75", label: "0.75 mm²", areaMm2: 0.75, awg: "18" },
  { id: "1.0", label: "1.0 mm²", areaMm2: 1.0, awg: "17" },
  { id: "1.5", label: "1.5 mm²", areaMm2: 1.5, awg: "16" },
  { id: "2.5", label: "2.5 mm²", areaMm2: 2.5, awg: "14" },
  { id: "awg12", label: "AWG 12", areaMm2: 3.31, awg: "12" }
];

interface PackageThermal {
  rthJc: number;
  tauDieS: number;
  tauBoardS: number;
}

const PACKAGE_ZTH: Record<string, PackageThermal> = {
  VNQ7050AJ: { rthJc: 3, tauDieS: 0.02, tauBoardS: 8 },
  "BTS7008-2EPA": { rthJc: 1.2, tauDieS: 0.015, tauBoardS: 6 },
  BTS50085: { rthJc: 0.8, tauDieS: 0.05, tauBoardS: 15 }
};

export function gaugeByArea(areaMm2: number): WireGauge {
  return WIRE_GAUGES.find((gauge) => Math.abs(gauge.areaMm2 - areaMm2) < 1e-6) ?? WIRE_GAUGES[2];
}

export function rhoAt(tempC: number): number {
  return RHO_CU_20 * (1 + ALPHA_CU * (tempC - 20));
}

/** Round-trip harness resistance, ohms. */
export function loopResistanceOhm(lengthM: number, areaMm2: number, tempC: number): number {
  const areaM2 = areaMm2 * 1e-6;
  return (2 * lengthM * rhoAt(tempC)) / areaM2;
}

export function wireDropV(currentA: number, lengthM: number, areaMm2: number, tempC: number): number {
  return currentA * loopResistanceOhm(lengthM, areaMm2, tempC);
}

export function wireTemperatureRise(currentA: number, areaMm2: number, ambientC: number): number {
  const areaM2 = areaMm2 * 1e-6;
  const dCu = Math.sqrt((4 * areaM2) / Math.PI);
  const dIns = dCu + 2 * INSULATION_WALL_M;
  let temp = ambientC;
  for (let i = 0; i < 6; i += 1) {
    const rPerM = rhoAt(temp) / areaM2;
    const wattsPerM = currentA * currentA * rPerM;
    temp = ambientC + wattsPerM / (WIRE_H_W_M2K * Math.PI * dIns);
  }
  return temp - ambientC;
}

/** Adiabatic copper I²t, A²s. k is the IEC insulation constant, S is mm². */
export function wireI2t(areaMm2: number, insulation: "pvc" | "xlpe"): number {
  const k = INSULATION_K[insulation];
  return (k * areaMm2) ** 2;
}

export function fuseMeltI2t(ratingA: number): number {
  const row = FUSE_MELT_I2T.find((item) => item.ratingA === ratingA);
  if (row) return row.i2t;
  const below = [...FUSE_MELT_I2T].reverse().find((item) => item.ratingA < ratingA);
  const above = FUSE_MELT_I2T.find((item) => item.ratingA > ratingA);
  if (below && above) {
    const span = above.ratingA - below.ratingA;
    const fraction = (ratingA - below.ratingA) / span;
    return below.i2t + (above.i2t - below.i2t) * fraction;
  }
  return (ratingA / 10) ** 2 * 140;
}

export function zthCPerW(part: HighSidePart, tS: number): number {
  const model = PACKAGE_ZTH[part.id] ?? { rthJc: part.thetaJa * 0.1, tauDieS: 0.02, tauBoardS: 8 };
  const rjc = Math.min(model.rthJc, part.thetaJa);
  const die = rjc * (1 - Math.exp(-tS / model.tauDieS));
  const board = (part.thetaJa - rjc) * (1 - Math.exp(-tS / model.tauBoardS));
  return die + board;
}

export interface ChannelReport {
  channel: HarnessChannel;
  part: HighSidePart | undefined;
  rdsOhm: number;
  pSteadyW: number;
  tjC: number;
  inrushPW: number;
  inrushS: number;
  inrushNote: string;
  dTInrushC: number;
  tjInrushC: number;
  rSenseMaxOhm: number;
  rSenseOhm: number;
  vSenseLoad: number;
  vSenseFault: number;
  rSeriesOhm: number;
  loopOhm: number;
  dropV: number;
  wireRiseC: number;
  wireI2t: number;
  fuseI2t: number;
  fuseCoordinates: boolean;
  dropOk: boolean;
  thermalOk: boolean;
}

export interface HarnessResult {
  channels: ChannelReport[];
  warnings: string[];
  worstTj: number;
}

function solvePackage(part: HighSidePart, channels: HarnessChannel[], ta: number): { tj: number; rds: number; powers: number[] } {
  let tj = ta;
  let powers = channels.map((channel) => channel.currentA ** 2 * part.rds25Ohm);
  let rds = part.rds25Ohm;
  for (let n = 0; n < 12; n += 1) {
    rds = rdsAtTemperature(part, tj);
    powers = channels.map((channel) => channel.currentA ** 2 * rds);
    const p = powers.reduce((sum, watts) => sum + watts, 0);
    tj = ta + part.thetaJa * p;
  }
  return { tj, rds, powers };
}

function inrush(channel: HarnessChannel, part: HighSidePart, vRail: number): { pW: number; tS: number; note: string } {
  if (channel.loadKind === "capacitive") {
    const energy = 0.5 * channel.capacitanceF * vRail * vRail;
    const tS = part.iLimitA > 0 ? (channel.capacitanceF * vRail) / part.iLimitA : 0;
    return { pW: tS > 0 ? energy / tS : 0, tS, note: "FET absorbs ½CV² while the current limit charges the capacitor." };
  }
  if (channel.loadKind === "lamp" || channel.loadKind === "fan") {
    const wanted = channel.currentA * channel.inrushMultiple;
    const tS = channel.inrushMs / 1000;
    if (wanted > part.iLimitA) {
      return { pW: part.iLimitA * vRail * 0.5, tS, note: "Inrush hits the current limit. Average voltage left across the FET is half the rail." };
    }
    return { pW: wanted * wanted * part.rds25Ohm, tS, note: "Switch stays enhanced. Cold inrush is the multiple times steady current." };
  }
  return { pW: channel.currentA ** 2 * part.rds25Ohm, tS: 1, note: "Resistive load, no extra inrush interval." };
}

export function analyzeHarness(input: HarnessInput): HarnessResult {
  const warnings: string[] = [];
  const groups = new Map<string, HarnessChannel[]>();
  for (const channel of input.channels) {
    const key = `${channel.switchId}::${channel.packageGroup}`;
    const list = groups.get(key) ?? [];
    list.push(channel);
    groups.set(key, list);
  }
  const solved = new Map<string, { tj: number; rds: number; powers: Map<string, number> }>();
  for (const [key, list] of groups) {
    const part = highSideById(list[0]?.switchId ?? "");
    if (!part) continue;
    if (list.length > part.channels) {
      warnings.push(`${part.mpn} group ${list[0]?.packageGroup} has ${list.length} loads and only ${part.channels} channels.`);
    }
    const result = solvePackage(part, list, input.ta);
    const powers = new Map<string, number>();
    list.forEach((channel, index) => powers.set(channel.id, result.powers[index] ?? 0));
    solved.set(key, { tj: result.tj, rds: result.rds, powers });
  }

  const channels: ChannelReport[] = input.channels.map((channel) => {
    const part = highSideById(channel.switchId);
    const key = `${channel.switchId}::${channel.packageGroup}`;
    const pack = solved.get(key);
    const empty: ChannelReport = {
      channel,
      part,
      rdsOhm: 0,
      pSteadyW: 0,
      tjC: input.ta,
      inrushPW: 0,
      inrushS: 0,
      inrushNote: part ? "" : "Unknown high-side part.",
      dTInrushC: 0,
      tjInrushC: input.ta,
      rSenseMaxOhm: 0,
      rSenseOhm: 0,
      vSenseLoad: 0,
      vSenseFault: 0,
      rSeriesOhm: 0,
      loopOhm: loopResistanceOhm(channel.lengthM, channel.areaMm2, input.ta),
      dropV: 0,
      wireRiseC: 0,
      wireI2t: wireI2t(channel.areaMm2, channel.insulation),
      fuseI2t: fuseMeltI2t(channel.fuseA),
      fuseCoordinates: false,
      dropOk: false,
      thermalOk: false
    };
    if (!part || !pack) return empty;
    const pulse = inrush(channel, part, input.vRail);
    const others = [...pack.powers.entries()].filter(([id]) => id !== channel.id).reduce((sum, [, watts]) => sum + watts, 0);
    const zth = zthCPerW(part, Math.max(pulse.tS, 1e-6));
    const tjInrush = input.ta + part.thetaJa * others + zth * pulse.pW;
    const rMax = part.iLimitA > 0 ? (input.vAdcMax * part.kilisMin) / part.iLimitA : 0;
    const rSense = 0.8 * rMax;
    const vLoad = part.kilisTyp > 0 ? (channel.currentA / part.kilisTyp) * rSense : 0;
    const vFault = part.kilisMin > 0 ? (part.iLimitA / part.kilisMin) * rSense : 0;
    const rSeries = Math.max(1000, (input.vRail - input.vAdcMax) / ADC_INJECT_A);
    const wireTemp = input.ta + wireTemperatureRise(channel.currentA, channel.areaMm2, input.ta);
    const loop = loopResistanceOhm(channel.lengthM, channel.areaMm2, wireTemp);
    const drop = channel.currentA * loop;
    const rise = wireTemp - input.ta;
    const wI2t = wireI2t(channel.areaMm2, channel.insulation);
    const fI2t = fuseMeltI2t(channel.fuseA);
    const dropLimit = 0.02 * input.vRail;
    return {
      channel,
      part,
      rdsOhm: pack.rds,
      pSteadyW: pack.powers.get(channel.id) ?? 0,
      tjC: pack.tj,
      inrushPW: pulse.pW,
      inrushS: pulse.tS,
      inrushNote: pulse.note,
      dTInrushC: zth * pulse.pW,
      tjInrushC: tjInrush,
      rSenseMaxOhm: rMax,
      rSenseOhm: rSense,
      vSenseLoad: vLoad,
      vSenseFault: vFault,
      rSeriesOhm: rSeries,
      loopOhm: loop,
      dropV: drop,
      wireRiseC: rise,
      wireI2t: wI2t,
      fuseI2t: fI2t,
      fuseCoordinates: fI2t < wI2t,
      dropOk: drop <= dropLimit,
      thermalOk: pack.tj < part.tsdC - 10 && tjInrush < part.tsdC
    };
  });

  for (const report of channels) {
    if (!report.fuseCoordinates) {
      warnings.push(`${report.channel.name}: fuse I²t ${report.fuseI2t.toFixed(0)} A²s is not below the wire limit ${report.wireI2t.toFixed(0)} A²s.`);
    }
    if (!report.dropOk) {
      warnings.push(`${report.channel.name}: round-trip drop ${report.dropV.toFixed(3)} V exceeds 2% of the rail.`);
    }
    if (!report.thermalOk) {
      warnings.push(
        `${report.channel.name}: steady junction ${report.tjC.toFixed(0)} °C, inrush prediction ${report.tjInrushC.toFixed(0)} °C. Thermal shutdown is ${report.part?.tsdC ?? "—"} °C, so this pulse is not survivable as modelled.`
      );
    }
    if (report.vSenseFault > input.vAdcMax + 1e-6) {
      warnings.push(`${report.channel.name}: fault sense voltage exceeds the ADC rail.`);
    }
  }

  const worstTj = channels.reduce((max, report) => Math.max(max, report.tjC, report.tjInrushC), input.ta);
  return { channels, warnings, worstTj };
}
