/**
 * Input protection and Middlebrook input-filter stability.
 *
 * Reverse-polarity drop is evaluated at both the mission RMS current and the
 * coincident peak:
 *   Schottky (B560-class linearization): Vf = 0.35 V + I · 0.045 Ω
 *   P-MOSFET: V = I · RDS(on), P = I² · RDS(on)
 *   LM74700-Q1 + external N-MOSFET: P = I² · RDS + Vin · Iq
 *
 * TVS rows are the standard unidirectional 10/1000 µs ratings.
 * A part is acceptable when its standoff sits at or above the system maximum
 * operating voltage (16 V on 12 V, 32 V on 24 V, ISO 16750-2) and its clamping
 * voltage is strictly below the downstream regulator absolute maximum.
 * Pulse energy compared with the TVS is Ppk · 1 ms, the rectangular equivalent
 * of the 10/1000 µs rating. A real double-exponential integrates to less than that.
 *
 * Filter impedance seen by the buck, battery treated as an AC short:
 *   Z_L = R_L + jωL
 *   Z_C = 1 / (jωC)
 *   Z_d = R_d + 1 / (jω C_d)
 *   Z_out = Z_L ∥ (Z_C ∥ Z_d)
 *   f_c = 1 / (2π √(L C))
 *   Z_0 = √(L / C)
 * Recommended damper: C_d = 4 C, R_d = Z_0.
 *
 * The buck's low-frequency input impedance is the constant-power magnitude
 *   |Z_in| = η · Vin² / P_out = Vin² / P_in
 * Above the voltage-loop crossover it rises as f / f_crossover, because the
 * loop no longer holds the input current at P/V. Crossover defaults to fsw/10.
 * Middlebrook's extra 20 dB is |Z_out| / |Z_in| < 0.1.
 */

import { bucksById, IDEAL_DIODES, type BuckPart } from "../components-db";
import type { ProtectionInput } from "../types";

export interface TvsPart {
  id: string;
  series: string;
  vrwm: number;
  vbrMin: number;
  vbrMax: number;
  vc: number;
  ipp: number;
  /** Peak pulse power, watts, 10/1000 µs. */
  ppp: number;
}

export const TVS_PARTS: TvsPart[] = [
  { id: "SMBJ26A", series: "SMBJ 600 W", vrwm: 26, vbrMin: 28.9, vbrMax: 31.9, vc: 42.1, ipp: 14.3, ppp: 600 },
  { id: "SMCJ28A", series: "SMCJ 1500 W", vrwm: 28, vbrMin: 31.1, vbrMax: 34.4, vc: 45.4, ipp: 33, ppp: 1500 },
  { id: "SMBJ33A", series: "SMBJ 600 W", vrwm: 33, vbrMin: 36.7, vbrMax: 40.6, vc: 53.3, ipp: 11.3, ppp: 600 }
];

export const SCHOTTKY = { vf0: 0.35, rd: 0.045, mpn: "B560-class" } as const;

export interface PolarityDrop {
  id: string;
  label: string;
  dropRmsV: number;
  dropPeakV: number;
  lossRmsW: number;
  lossPeakW: number;
}

export interface TvsCheck {
  part: TvsPart;
  buck: BuckPart | undefined;
  standoffOk: boolean;
  clampOk: boolean;
  energyJ: number;
  energyRatingJ: number;
  energyOk: boolean;
  currentOk: boolean;
  marginV: number;
  pass: boolean;
}

export interface ImpedancePoint {
  fHz: number;
  zOut: number;
  zIn: number;
  ratio: number;
}

export interface ProtectionResult {
  polarity: PolarityDrop[];
  tvs: TvsCheck;
  fcHz: number;
  z0: number;
  rdRecommended: number;
  cdRecommended: number;
  zinDc: number;
  fCrossHz: number;
  peakRatio: number;
  stable: boolean;
  sweep: ImpedancePoint[];
  warnings: string[];
}

interface Complex {
  re: number;
  im: number;
}

function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cDiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return { re: Number.POSITIVE_INFINITY, im: 0 };
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

function cParallel(a: Complex, b: Complex): Complex {
  return cDiv(cMul(a, b), cAdd(a, b));
}

function cAbs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

export function schottkyDrop(current: number): { drop: number; loss: number } {
  const drop = SCHOTTKY.vf0 + current * SCHOTTKY.rd;
  return { drop, loss: drop * current };
}

export function resistiveDrop(current: number, rds: number): { drop: number; loss: number } {
  const drop = current * rds;
  return { drop, loss: current * current * rds };
}

export function filterCutoffHz(lH: number, cF: number): number {
  return 1 / (2 * Math.PI * Math.sqrt(lH * cF));
}

export function characteristicOhm(lH: number, cF: number): number {
  return Math.sqrt(lH / cF);
}

/** |Zin| = η Vin² / Pout below crossover, then proportional to f. */
export function buckInputImpedance(vin: number, pout: number, eta: number, fHz: number, fCrossHz: number): number {
  const dc = (eta * vin * vin) / pout;
  if (fHz <= fCrossHz) return dc;
  return dc * (fHz / fCrossHz);
}

export function filterOutputImpedance(fHz: number, input: ProtectionInput): number {
  const w = 2 * Math.PI * fHz;
  const zL: Complex = { re: input.rlOhm, im: w * input.lH };
  const zC: Complex = { re: 0, im: -1 / (w * input.cF) };
  let zShunt = zC;
  if (input.cdF > 0 && input.rdOhm > 0) {
    const zD: Complex = { re: input.rdOhm, im: -1 / (w * input.cdF) };
    zShunt = cParallel(zC, zD);
  }
  return cAbs(cParallel(zL, zShunt));
}

export function analyzeProtection(input: ProtectionInput): ProtectionResult {
  const warnings: string[] = [];
  const ideal = IDEAL_DIODES[0];
  const schR = schottkyDrop(input.iRms);
  const schP = schottkyDrop(input.iPeak);
  const pmosR = resistiveDrop(input.iRms, input.pmosRdsOhm);
  const pmosP = resistiveDrop(input.iPeak, input.pmosRdsHotOhm);
  const fetR = resistiveDrop(input.iRms, ideal.defaultFetRdsOhm);
  const fetP = resistiveDrop(input.iPeak, ideal.defaultFetRdsOhm);
  const iq = input.vin * ideal.iqA;
  const polarity: PolarityDrop[] = [
    { id: "schottky", label: "Series Schottky", dropRmsV: schR.drop, dropPeakV: schP.drop, lossRmsW: schR.loss, lossPeakW: schP.loss },
    { id: "pmos", label: "P-channel MOSFET", dropRmsV: pmosR.drop, dropPeakV: pmosP.drop, lossRmsW: pmosR.loss, lossPeakW: pmosP.loss },
    {
      id: "ideal",
      label: "LM74700-Q1 + N-MOSFET",
      dropRmsV: fetR.drop,
      dropPeakV: fetP.drop,
      lossRmsW: fetR.loss + iq,
      lossPeakW: fetP.loss + iq
    }
  ];

  const part = TVS_PARTS.find((item) => item.id === input.tvsId) ?? TVS_PARTS[2];
  const buck = bucksById(input.buckId);
  const energyJ = 0.5 * input.lCoilH * input.iCoilA * input.iCoilA;
  const energyRatingJ = part.ppp * 1e-3;
  const standoffOk = part.vrwm + 1e-9 >= input.vSystemMax;
  const marginV = buck ? buck.vinMax - part.vc : Number.NaN;
  const clampOk = Boolean(buck) && part.vc < (buck?.vinMax ?? 0);
  const energyOk = energyJ <= energyRatingJ;
  const currentOk = input.iCoilA <= part.ipp;
  if (!standoffOk) warnings.push(`${part.id} standoff ${part.vrwm} V is below the ${input.vSystemMax} V system maximum, so it conducts during normal operation.`);
  if (!clampOk) warnings.push(`${part.id} clamps at ${part.vc} V, which is not below ${buck?.mpn ?? "the buck"} absolute maximum.`);
  if (!energyOk) warnings.push(`Coil energy ${energyJ.toFixed(3)} J exceeds the ${energyRatingJ.toFixed(2)} J rectangular 10/1000 µs rating.`);
  if (!currentOk) warnings.push(`Coil current ${input.iCoilA.toFixed(2)} A exceeds the TVS peak pulse current ${part.ipp} A.`);

  const fcHz = filterCutoffHz(input.lH, input.cF);
  const z0 = characteristicOhm(input.lH, input.cF);
  const fCrossHz = input.fCrossHz > 0 ? input.fCrossHz : input.fswHz / 10;
  const zinDc = buckInputImpedance(input.vin, input.pout, input.eta, fCrossHz / 2, fCrossHz);
  const sweep: ImpedancePoint[] = [];
  let peakRatio = 0;
  const fStart = 100;
  const fStop = 10e6;
  const steps = 80;
  for (let i = 0; i <= steps; i += 1) {
    const f = fStart * (fStop / fStart) ** (i / steps);
    const zOut = filterOutputImpedance(f, input);
    const zIn = buckInputImpedance(input.vin, input.pout, input.eta, f, fCrossHz);
    const ratio = zIn > 0 ? zOut / zIn : Number.POSITIVE_INFINITY;
    if (ratio > peakRatio) peakRatio = ratio;
    sweep.push({ fHz: f, zOut, zIn, ratio });
  }
  const stable = peakRatio < 0.1;
  if (!stable) {
    warnings.push(`Peak |Zout|/|Zin| is ${peakRatio.toFixed(3)}. Middlebrook wants this under 0.1 (20 dB). Set Rd = ${z0.toFixed(3)} Ω and Cd = ${(4 * input.cF * 1e6).toFixed(1)} µF.`);
  }
  if (input.rdOhm <= 0 || input.cdF <= 0) warnings.push("The damper branch is open, so the LC peak is limited only by the inductor DCR.");

  return {
    polarity,
    tvs: {
      part,
      buck,
      standoffOk,
      clampOk,
      energyJ,
      energyRatingJ,
      energyOk,
      currentOk,
      marginV,
      pass: standoffOk && clampOk && energyOk && currentOk
    },
    fcHz,
    z0,
    rdRecommended: z0,
    cdRecommended: 4 * input.cF,
    zinDc,
    fCrossHz,
    peakRatio,
    stable,
    sweep,
    warnings
  };
}
