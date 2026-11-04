/**
 * PCB copper, thermal vias, and controlled impedance.
 *
 * Trace temperature rise is the Brooks & Adam IPC-2152 fit already used for
 * 1 oz copper. External layers keep K = 215.3 for every weight; thickness
 * carries the ounce. Internal layers use a weight-specific row. The 1 oz
 * internal row is identical to ipc2152.ts. The 0.5 oz and 2 oz rows are the
 * same regression family (K = 120 and K = 300) so a heavier internal plane
 * runs cooler, which is what the IPC-2152 charts show.
 *
 * A via barrel is given the cross-section π·d·t and then the internal fit.
 * Equivalent trace width is area / plating = π·d.
 * Partial inductance of one via:
 *   L = (μ0 h / 2π) · (ln(4h/d) + 1) = 2×10⁻⁷ · h · (ln(4h/d) + 1)
 * Parallel vias share current with a mutual factor 0.3:
 *   L_eq = L · (1 + 0.3 · (N−1) / N) / N
 *
 * Thermal via conduction into the nearest plane (the prepreg, not the whole
 * board):
 *   R_via = h / (k_Cu · π · d · t)     k_Cu = 385 W/m·K
 *   R_array = R_via / N
 *   θJA = θJC + R_array + θ_plane-to-ambient
 *
 * Microstrip is Hammerstad. Conductor-backed coplanar waveguide uses the
 * conformal-mapping form with the elliptic-integral ratio approximated to
 * about 0.1%. Differential impedance is the edge-coupled approximation
 *   Zdiff = 2 Z0(W) · (1 − 0.48 exp(−0.96 · S/H))
 * Width and gap are solved by bisection against that formula.
 */

import { COPPER_1OZ_MILS, IPC2152_EXTERNAL, IPC2152_INTERNAL_1OZ } from "./ipc2152";
import type { PcbInput } from "../types";

export const K_COPPER = 385;

export const IPC2152_INTERNAL_BY_OZ = {
  0.5: { k: 120, iExp: 2, wExp: -1.15, thExp: -1.52 },
  1: IPC2152_INTERNAL_1OZ,
  2: { k: 300, iExp: 2, wExp: -1.15, thExp: -1.52 }
} as const;

export type CopperOz = keyof typeof IPC2152_INTERNAL_BY_OZ;

export interface Stackup {
  id: "JLC04161H-7628" | "JLC04161H-3313";
  label: string;
  /** L1 to L2 dielectric, metres. */
  hM: number;
  er: number;
  /** Outer copper, metres. */
  tM: number;
  note: string;
}

export const STACKUPS: Stackup[] = [
  {
    id: "JLC04161H-7628",
    label: "JLC04161H-7628",
    hM: 0.21e-3,
    er: 4.6,
    tM: 35e-6,
    note: "1.6 mm 4-layer, 7628 prepreg, Er 4.6, 0.210 mm to L2, 1 oz outer."
  },
  {
    id: "JLC04161H-3313",
    label: "JLC04161H-3313",
    hM: 0.102e-3,
    er: 4.05,
    tM: 35e-6,
    note: "1.6 mm 4-layer, 3313 prepreg, Er 4.05, 0.102 mm to L2, 1 oz outer."
  }
];

export const THERMAL_PACKAGES = {
  QFN: { rjc: 2.5, label: "QFN exposed pad" },
  DPAK: { rjc: 3.5, label: "DPAK / TO-252 tab" },
  "SOT-223": { rjc: 15, label: "SOT-223 tab" }
} as const;

const MIL = 0.0254;

export function ozToUm(oz: CopperOz): number {
  return oz * 35;
}

export function temperatureRiseAt(
  currentA: number,
  widthMm: number,
  layer: "external" | "internal",
  oz: CopperOz
): number {
  const widthMils = widthMm / MIL;
  const thMils = (ozToUm(oz) / 1000) / MIL;
  if (layer === "external") {
    const { k, iExp, wExp, thExp } = IPC2152_EXTERNAL;
    return k * currentA ** iExp * widthMils ** wExp * thMils ** thExp;
  }
  const { k, iExp, wExp, thExp } = IPC2152_INTERNAL_BY_OZ[oz];
  return k * currentA ** iExp * widthMils ** wExp * thMils ** thExp;
}

export function widthMmForRise(currentA: number, riseC: number, layer: "external" | "internal", oz: CopperOz): number {
  const thMils = ozToUm(oz) / 1000 / MIL;
  const coeff = layer === "external" ? IPC2152_EXTERNAL : IPC2152_INTERNAL_BY_OZ[oz];
  const { k, iExp, wExp, thExp } = coeff;
  const numerator = k * currentA ** iExp;
  const denominator = riseC * thMils ** -thExp;
  const mils = (numerator / denominator) ** (1 / -wExp);
  return mils * MIL;
}

/** One via's internal-fit current at a temperature rise. Plating ounce is `oz`. */
export function viaCurrentA(drillMm: number, oz: CopperOz, riseC: number): number {
  const widthMm = Math.PI * drillMm;
  const thMils = ozToUm(oz) / 1000 / MIL;
  const widthMils = widthMm / MIL;
  const { k, iExp, wExp, thExp } = IPC2152_INTERNAL_BY_OZ[oz];
  const rise = k * widthMils ** wExp * thMils ** thExp;
  if (rise <= 0) return 0;
  return (riseC / rise) ** (1 / iExp);
}

export function viaInductanceH(lengthM: number, drillM: number): number {
  if (drillM <= 0 || lengthM <= 0) return 0;
  return 2e-7 * lengthM * (Math.log((4 * lengthM) / drillM) + 1);
}

export function parallelViaInductanceH(lengthM: number, drillM: number, count: number): number {
  const single = viaInductanceH(lengthM, drillM);
  if (count <= 1) return single;
  return (single * (1 + 0.3 * ((count - 1) / count))) / count;
}

export function viasForCurrent(drillMm: number, oz: CopperOz, riseC: number, iPeak: number): number {
  const one = viaCurrentA(drillMm, oz, riseC);
  if (one <= 0) return 0;
  return Math.max(1, Math.ceil(iPeak / one));
}

export function viaThermalResistance(hM: number, drillM: number, platingM: number): number {
  const area = Math.PI * drillM * platingM;
  return hM / (K_COPPER * area);
}

export interface ThermalArray {
  n: number;
  rOne: number;
  rArray: number;
  thetaJa: number;
  rjc: number;
  rPlane: number;
}

export function thermalViaArray(input: PcbInput, stack: Stackup): ThermalArray {
  const n = input.grid * input.grid;
  const rOne = viaThermalResistance(stack.hM, input.viaDrillMm / 1000, input.platingUm * 1e-6);
  const rArray = rOne / n;
  const rjc = THERMAL_PACKAGES[input.thermalPackage].rjc;
  return {
    n,
    rOne,
    rArray,
    rjc,
    rPlane: input.rPlane,
    thetaJa: rjc + rArray + input.rPlane
  };
}

function microstripEps(wOverH: number, er: number): number {
  const u = Math.max(wOverH, 1e-4);
  const base = ((er + 1) / 2) + ((er - 1) / 2) * (1 + 12 / u) ** -0.5;
  if (u >= 1) return base;
  return base + ((er - 1) / 2) * 0.04 * (1 - u) ** 2;
}

/** Hammerstad microstrip, ohms. Dimensions in metres. */
export function microstripOhm(wM: number, hM: number, er: number): number {
  const u = wM / hM;
  const eps = microstripEps(u, er);
  if (u < 1) return (60 / Math.sqrt(eps)) * Math.log(8 / u + u / 4);
  return (120 * Math.PI) / (Math.sqrt(eps) * (u + 1.393 + 0.667 * Math.log(u + 1.444)));
}

export function differentialOhm(wM: number, sM: number, hM: number, er: number): number {
  const z0 = microstripOhm(wM, hM, er);
  return 2 * z0 * (1 - 0.48 * Math.exp(-0.96 * (sM / hM)));
}

function ellipRatio(k: number): number {
  const clamped = Math.min(0.999999, Math.max(1e-6, k));
  const kp = Math.sqrt(1 - clamped * clamped);
  if (clamped <= 0.70710678118) {
    return Math.PI / Math.log((2 * (1 + Math.sqrt(kp))) / (1 - Math.sqrt(kp)));
  }
  return Math.log((2 * (1 + Math.sqrt(clamped))) / (1 - Math.sqrt(clamped))) / Math.PI;
}

/** Conductor-backed coplanar waveguide, ohms. Gap is the slot to the coplanar ground. */
export function cpwOhm(wM: number, gM: number, hM: number, er: number): number {
  const k = wM / (wM + 2 * gM);
  const k1 = Math.tanh((Math.PI * wM) / (4 * hM)) / Math.tanh((Math.PI * (wM + 2 * gM)) / (4 * hM));
  const ratio = ellipRatio(k1) / ellipRatio(k);
  const eps = 1 + ((er - 1) / 2) * ratio;
  return ((30 * Math.PI) / Math.sqrt(eps)) / ellipRatio(k);
}

function bisect(target: number, lo: number, hi: number, fn: (x: number) => number): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 48; i += 1) {
    const mid = 0.5 * (a + b);
    if (fn(mid) > target) a = mid;
    else b = mid;
  }
  return 0.5 * (a + b);
}

export function solveMicrostripM(targetOhm: number, hM: number, er: number): number {
  return bisect(targetOhm, 0.05e-3, 3e-3, (w) => microstripOhm(w, hM, er));
}

export function solveCpwM(targetOhm: number, gM: number, hM: number, er: number): number {
  return bisect(targetOhm, 0.05e-3, 2e-3, (w) => cpwOhm(w, gM, hM, er));
}

export interface DiffSolution {
  wM: number;
  sM: number;
  zDiff: number;
  zSingle: number;
}

export function solveDifferential(targetOhm: number, hM: number, er: number): DiffSolution {
  let best: DiffSolution = { wM: 0.2e-3, sM: 0.15e-3, zDiff: 0, zSingle: 0 };
  let bestErr = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 24; step += 1) {
    const sM = (0.1 + step * 0.02) * 1e-3;
    const wM = bisect(targetOhm, 0.08e-3, 1.5e-3, (w) => differentialOhm(w, sM, hM, er));
    const zDiff = differentialOhm(wM, sM, hM, er);
    const err = Math.abs(zDiff - targetOhm);
    const preference = err + Math.abs(sM - wM) * 20;
    if (preference < bestErr) {
      bestErr = preference;
      best = { wM, sM, zDiff, zSingle: microstripOhm(wM, hM, er) };
    }
  }
  return best;
}

export interface PcbResult {
  stack: Stackup;
  externalWidthMm: number;
  internalWidthMm: number;
  externalRise: number;
  internalRise: number;
  viaOneA: number;
  viaCount: number;
  viaLSingleH: number;
  viaLParallelH: number;
  thermal: ThermalArray;
  usb: DiffSolution;
  can: DiffSolution;
  se50M: number;
  se50Ohm: number;
  cpwM: number;
  cpwOhm: number;
  warnings: string[];
}

export function analyzePcb(input: PcbInput): PcbResult {
  const stack = STACKUPS.find((item) => item.id === input.stackupId) ?? STACKUPS[0];
  const warnings: string[] = [];
  const externalWidthMm = widthMmForRise(input.currentA, input.riseC, "external", input.oz);
  const internalWidthMm = widthMmForRise(input.currentA, input.riseC, "internal", input.oz);
  const viaOne = viaCurrentA(input.viaDrillMm, input.oz, 0.5);
  const viaCount = viasForCurrent(input.viaDrillMm, input.oz, 0.5, input.iPeak);
  const viaL = viaInductanceH(stack.hM, input.viaDrillMm / 1000);
  const viaLp = parallelViaInductanceH(stack.hM, input.viaDrillMm / 1000, viaCount);
  const thermal = thermalViaArray(input, stack);
  const usb = solveDifferential(90, stack.hM, stack.er);
  const can = solveDifferential(120, stack.hM, stack.er);
  const se50M = solveMicrostripM(50, stack.hM, stack.er);
  const cpwGap = 0.15e-3;
  const cpwWidth = solveCpwM(50, cpwGap, stack.hM, stack.er);
  if (externalWidthMm > 5) warnings.push("External width is past 5 mm. Use a copper pour.");
  if (viaCount > 40) warnings.push(`${viaCount} vias are required for a 0.5 °C barrel rise. That is a via field, not a stitch.`);
  if (Math.abs(usb.zDiff - 90) > 1) warnings.push("USB 90 Ω pair did not converge on this stackup.");
  if (Math.abs(can.zDiff - 120) > 1) warnings.push("CAN 120 Ω pair did not converge on this stackup.");
  return {
    stack,
    externalWidthMm,
    internalWidthMm,
    externalRise: temperatureRiseAt(input.currentA, externalWidthMm, "external", input.oz),
    internalRise: temperatureRiseAt(input.currentA, internalWidthMm, "internal", input.oz),
    viaOneA: viaOne,
    viaCount,
    viaLSingleH: viaL,
    viaLParallelH: viaLp,
    thermal,
    usb,
    can,
    se50M,
    se50Ohm: microstripOhm(se50M, stack.hM, stack.er),
    cpwM: cpwWidth,
    cpwOhm: cpwOhm(cpwWidth, cpwGap, stack.hM, stack.er),
    warnings
  };
}

export function internalOneOzMatchesLegacy(widthMils: number, currentA: number): boolean {
  const fromPcb = temperatureRiseAt(currentA, widthMils * MIL, "internal", 1);
  const legacy =
    IPC2152_INTERNAL_1OZ.k *
    currentA ** IPC2152_INTERNAL_1OZ.iExp *
    widthMils ** IPC2152_INTERNAL_1OZ.wExp *
    COPPER_1OZ_MILS ** IPC2152_INTERNAL_1OZ.thExp;
  return Math.abs(fromPcb - legacy) < 1e-9;
}
