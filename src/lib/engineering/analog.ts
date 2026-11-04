/**
 * Analog front end: divider, STM32 sample-and-hold, NTC.
 *
 * Divider from a high voltage into the ADC:
 *   Vout = Vin · R2 / (R1 + R2)
 *   Rth = R1 ∥ R2
 *   P = Vin² / (R1 + R2)
 * R1 and R2 are snapped to E24 (5%) or E96 (1%).
 *
 * Charge sharing when the sample capacitor starts empty (worst single shot):
 *   ΔV = V · C_ADC / (C_filt + C_ADC)
 *   error in LSB = ΔV / (Vref / 2^N)
 * The filter that holds this under 0.5 LSB at full scale is
 *   C_filt ≥ C_ADC · (2^N / 0.5 − 1)
 * Settling through the source during the sampling window is separate:
 *   ε = exp(−t_sample / ((Rth + R_ADC) · C_ADC))
 * Cutoff of the anti-alias network is 1 / (2π · Rth · C_filt).
 *
 * NTC, beta equation, T in kelvin:
 *   R(T) = R0 · exp(β (1/T − 1/T0))
 * Steinhart–Hart:
 *   1/T = A + B ln R + C (ln R)³
 * With C = 0, B = 1/β and A = 1/T0 − (ln R0)/β the two models are the same curve.
 * The divider is Vref — Rfixed — ADC — NTC — ground.
 */

import type { AnalogInput } from "../types";

export const E24 = [1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.4, 2.7, 3, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

export const E96 = [
  1, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.37, 1.4, 1.43, 1.47, 1.5, 1.54, 1.58, 1.62, 1.65,
  1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2, 2.05, 2.1, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.8,
  2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.4, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75,
  4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.9, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.5, 7.68, 7.87, 8.06,
  8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76
];

export function seriesMantissa(series: "E24" | "E96"): number[] {
  return series === "E96" ? E96 : E24;
}

export function nearestInSeries(ohms: number, series: "E24" | "E96"): number {
  if (!(ohms > 0)) return 0;
  const decade = 10 ** Math.floor(Math.log10(ohms));
  const mantissas = seriesMantissa(series);
  let best = mantissas[0] * decade;
  let bestErr = Math.abs(best - ohms);
  for (const scale of [decade / 10, decade, decade * 10]) {
    for (const mantissa of mantissas) {
      const candidate = mantissa * scale;
      const err = Math.abs(candidate - ohms);
      if (err < bestErr) {
        best = candidate;
        bestErr = err;
      }
    }
  }
  return best;
}

export function lsbVolts(vref: number, bits: number): number {
  return vref / 2 ** bits;
}

/** Minimum hold capacitor so a discharged C_ADC droops by less than half an LSB at full scale. */
export function cFiltMinF(cAdcF: number, bits: number, lsbFraction = 0.5): number {
  return cAdcF * (2 ** bits / lsbFraction - 1);
}

export function chargeDroopLsb(vMeasured: number, vref: number, bits: number, cFiltF: number, cAdcF: number): number {
  const droopV = (vMeasured * cAdcF) / (cFiltF + cAdcF);
  return droopV / lsbVolts(vref, bits);
}

export function settlingLsb(vMeasured: number, vref: number, bits: number, rSource: number, rAdc: number, cAdcF: number, tSampleS: number): number {
  const tau = (rSource + rAdc) * cAdcF;
  const fraction = Math.exp(-tSampleS / tau);
  return (vMeasured * fraction) / lsbVolts(vref, bits);
}

export interface DividerDesign {
  r1: number;
  r2: number;
  voutAtMax: number;
  ratioErrorPct: number;
  rThevenin: number;
  pTotal: number;
  pR1: number;
  pR2: number;
  droopLsb: number;
  settlingLsb: number;
  cFiltMin: number;
  f3dbHz: number;
  droopOk: boolean;
}

export function analyzeDivider(input: AnalogInput): DividerDesign {
  const idealR2 = input.r2Ohm;
  const idealR1 = input.r2Ohm * (input.vinSense / input.vAdcTarget - 1);
  const r2 = nearestInSeries(idealR2, input.series);
  const r1 = nearestInSeries(idealR1, input.series);
  const vout = (input.vinSense * r2) / (r1 + r2);
  const ratioErrorPct = ((vout - input.vAdcTarget) / input.vAdcTarget) * 100;
  const rth = (r1 * r2) / (r1 + r2);
  const i = input.vinSense / (r1 + r2);
  const cMin = cFiltMinF(input.cAdcF, input.bits, 0.5);
  const droop = chargeDroopLsb(vout, input.vref, input.bits, input.cFiltF, input.cAdcF);
  const settling = settlingLsb(vout, input.vref, input.bits, rth, input.rAdcOhm, input.cAdcF, input.tSampleUs * 1e-6);
  return {
    r1,
    r2,
    voutAtMax: vout,
    ratioErrorPct,
    rThevenin: rth,
    pTotal: input.vinSense * i,
    pR1: i * i * r1,
    pR2: i * i * r2,
    droopLsb: droop,
    settlingLsb: settling,
    cFiltMin: cMin,
    f3dbHz: 1 / (2 * Math.PI * rth * input.cFiltF),
    droopOk: droop < 0.5
  };
}

export function ntcResistance(tempC: number, r0: number, beta: number, t0C: number): number {
  const t = tempC + 273.15;
  const t0 = t0C + 273.15;
  return r0 * Math.exp(beta * (1 / t - 1 / t0));
}

export function steinhartTemperatureC(resistance: number, a: number, b: number, c: number): number {
  const ln = Math.log(resistance);
  const inv = a + b * ln + c * ln ** 3;
  return 1 / inv - 273.15;
}

export function betaToSteinhart(r0: number, beta: number, t0C: number): { a: number; b: number; c: number } {
  const t0 = t0C + 273.15;
  return { a: 1 / t0 - Math.log(r0) / beta, b: 1 / beta, c: 0 };
}

export interface NtcPoint {
  tempC: number;
  resistance: number;
  volts: number;
  counts: number;
  cPerLsb: number;
}

export interface NtcDesign {
  points: NtcPoint[];
  at25: NtcPoint | undefined;
  betaMatchesSteinhart: boolean;
}

export interface AnalogResult {
  divider: DividerDesign;
  ntc: NtcDesign;
}

export function analyzeNtc(input: AnalogInput): NtcDesign {
  const sh = input.useSteinhart ? { a: input.shA, b: input.shB, c: input.shC } : betaToSteinhart(input.ntcR0, input.ntcBeta, input.ntcT0C);
  const lsb = lsbVolts(input.vref, input.bits);
  const points: NtcPoint[] = [];
  for (let tempC = -20; tempC <= 125; tempC += 1) {
    const resistance = ntcResistance(tempC, input.ntcR0, input.ntcBeta, input.ntcT0C);
    const volts = (input.vref * resistance) / (input.rFixed + resistance);
    const counts = volts / lsb;
    const rPlus = ntcResistance(tempC + 0.25, input.ntcR0, input.ntcBeta, input.ntcT0C);
    const rMinus = ntcResistance(tempC - 0.25, input.ntcR0, input.ntcBeta, input.ntcT0C);
    const vPlus = (input.vref * rPlus) / (input.rFixed + rPlus);
    const vMinus = (input.vref * rMinus) / (input.rFixed + rMinus);
    const dCount = (vPlus - vMinus) / lsb;
    const cPerLsb = dCount === 0 ? Number.POSITIVE_INFINITY : Math.abs(0.5 / dCount);
    points.push({ tempC, resistance, volts, counts, cPerLsb });
  }
  const r25 = ntcResistance(25, input.ntcR0, input.ntcBeta, input.ntcT0C);
  const tFromSh = steinhartTemperatureC(r25, sh.a, sh.b, sh.c);
  return {
    points,
    at25: points.find((point) => point.tempC === 25),
    betaMatchesSteinhart: Math.abs(tFromSh - 25) < 1e-6
  };
}

export function analyzeAnalog(input: AnalogInput): AnalogResult {
  return { divider: analyzeDivider(input), ntc: analyzeNtc(input) };
}
