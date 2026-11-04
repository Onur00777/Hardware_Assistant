/**
 * Buck magnetics and MLCC DC-bias physics.
 *
 * Inductor volt-seconds in CCM, ideal switch drops ignored:
 *   D = Vout / Vin
 *   ΔI = k · Iout          k is the ripple fraction, 0.20 to 0.40
 *   L = (Vin − Vout) · D / (fsw · ΔI)
 *   Ipeak = Iout + ΔI / 2
 *   Isat  ≥ Ipeak · (1 + margin)     margin default 0.25
 *   Irms² = Iout² + ΔI² / 12
 *
 * Copper: R(T) = R25 · (1 + 0.00393 · (T − 25)), Pcu = Irms² · R(T).
 *
 * Core: improved Generalized Steinmetz (iGSE) on a 3C90-class MnZn ferrite.
 * Steinmetz sine law, P in W/m³, B in tesla, f in hertz:
 *   Pv = k · f^α · Bpk^β
 *   k = 4.74, α = 1.46, β = 2.75
 * which is about 150 mW/cm³ at 100 kHz and 100 mT.
 * k_i is defined so a sine wave reproduces that law. Triangular buck flux then uses
 *   Pv = k_i · (ΔB)^β · f^α · (D^(1−α) + (1−D)^(1−α))
 * with ΔB = Bsat · ΔI / Isat and Bsat = 0.35 T. Catalog Isat is treated as the
 * current at Bsat (vendors usually quote the 30% drop point, which sits near that knee).
 */

import type { MagneticsInput } from "../types";

export const FERRITE = {
  name: "3C90-class MnZn",
  k: 4.74,
  alpha: 1.46,
  beta: 2.75,
  bsat: 0.35
} as const;

export const COPPER_TEMPCO = 0.00393;

export interface InductorCatalogItem {
  id: string;
  mpn: string;
  vendor: string;
  lH: number;
  dcr25Ohm: number;
  isatA: number;
  /** Winding volume used by iGSE, cubic centimetres. */
  volumeCm3: number;
  note: string;
}

/** Catalog typicals: inductance, 25 °C DCR, saturation current, body volume. */
export const INDUCTORS: InductorCatalogItem[] = [
  {
    id: "XAL4030-472",
    mpn: "XAL4030-472",
    vendor: "Coilcraft",
    lH: 4.7e-6,
    dcr25Ohm: 0.04,
    isatA: 5.2,
    volumeCm3: 4 * 4 * 3.1 * 1e-3,
    note: "4.7 µH, 40 mΩ, 5.2 A Isat, 4.0 × 4.0 × 3.1 mm."
  },
  {
    id: "XAL6060-103",
    mpn: "XAL6060-103",
    vendor: "Coilcraft",
    lH: 10e-6,
    dcr25Ohm: 0.027,
    isatA: 7.4,
    volumeCm3: 6 * 6 * 6.1 * 1e-3,
    note: "10 µH, 27 mΩ, 7.4 A Isat, 6.0 × 6.0 × 6.1 mm."
  },
  {
    id: "74437346047",
    mpn: "74437346047",
    vendor: "Würth",
    lH: 4.7e-6,
    dcr25Ohm: 0.029,
    isatA: 6.5,
    volumeCm3: 5.2 * 5.2 * 2.1 * 1e-3,
    note: "4.7 µH molded, 29 mΩ, 6.5 A Isat."
  },
  {
    id: "SRR1260-220",
    mpn: "SRR1260-220M",
    vendor: "Bourns",
    lH: 22e-6,
    dcr25Ohm: 0.042,
    isatA: 4.2,
    volumeCm3: 12 * 12 * 6 * 1e-3,
    note: "22 µH shielded, 42 mΩ, 4.2 A Isat. Useful when the 24 V to 5 V design wants more than 10 µH."
  }
];

export type MlccCase = "0402" | "0603" | "0805" | "1206";
export type MlccDielectric = "X5R" | "X7R";

/**
 * DC-bias fit C/Cnom = 1 / (1 + a · (Vdc/Vrated)^b).
 * Coefficients are case-size specific for X7R. X5R multiplies `a` by 1.35.
 * They are constrained so a 22 µF 6.3 V 0603 is under 7 µF at 3.8 V,
 * while 0805 and 1206 of the same nameplate keep substantially more.
 */
export const MLCC_DC_FIT: Record<MlccCase, { a: number; b: number }> = {
  "0402": { a: 8, b: 1.55 },
  "0603": { a: 5.8, b: 1.45 },
  "0805": { a: 2.4, b: 1.75 },
  "1206": { a: 1.35, b: 1.85 }
};

export const X5R_BIAS_SCALE = 1.35;

export interface InductorPoint {
  fHz: number;
  dI: number;
  iPeak: number;
  iRms: number;
  iSatMin: number;
  ccm: boolean;
  pCopper: number;
  pCore: number;
  pTotal: number;
  deltaBT: number;
}

export interface InductorDesign {
  valid: boolean;
  duty: number;
  lH: number;
  dI: number;
  iPeak: number;
  iValley: number;
  iRms: number;
  iSatMin: number;
  dcrOhm: number;
  pCopper: number;
  pCore: number;
  deltaBT: number;
  warnings: string[];
  sweep: InductorPoint[];
}

export interface MlccPoint {
  vdc: number;
  cNominalF: number;
  cEffectiveF: number;
  rippleNominalV: number;
  rippleEffectiveV: number;
}

export interface MlccDesign {
  retentionDc: number;
  retentionTemp: number;
  retention: number;
  cEffectiveF: number;
  esrParallelOhm: number;
  rippleCapV: number;
  rippleEsrV: number;
  rippleV: number;
  rippleNominalV: number;
  outsideTempRating: boolean;
  curve: MlccPoint[];
  warnings: string[];
}

function cosinePowerIntegral(alpha: number): number {
  const steps = 4000;
  const dTheta = (2 * Math.PI) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i += 1) {
    const theta = (i + 0.5) * dTheta;
    sum += Math.abs(Math.cos(theta)) ** alpha;
  }
  return sum * dTheta;
}

let cachedKi = Number.NaN;

/** iGSE prefactor that reproduces the sine Steinmetz law. See file header. */
export function ferriteKi(): number {
  if (Number.isFinite(cachedKi)) return cachedKi;
  const { k, alpha, beta } = FERRITE;
  const integral = cosinePowerIntegral(alpha);
  cachedKi = k / (2 ** (beta - alpha) * (2 * Math.PI) ** (alpha - 1) * integral);
  return cachedKi;
}

/** Sine-wave Steinmetz volumetric loss, W/m³. Bpk is the peak, not peak-to-peak. */
export function steinmetzSineWPerM3(fHz: number, bPeakT: number): number {
  const { k, alpha, beta } = FERRITE;
  return k * fHz ** alpha * bPeakT ** beta;
}

export function igseTriangleWPerM3(fHz: number, deltaBT: number, duty: number): number {
  const { alpha, beta } = FERRITE;
  const d = Math.min(0.999, Math.max(0.001, duty));
  const shape = d ** (1 - alpha) + (1 - d) ** (1 - alpha);
  return ferriteKi() * deltaBT ** beta * fHz ** alpha * shape;
}

export function igseSineWPerM3(fHz: number, bPeakT: number): number {
  const { alpha, beta } = FERRITE;
  const deltaB = 2 * bPeakT;
  const integral = cosinePowerIntegral(alpha);
  const mean = ((2 * Math.PI * fHz * bPeakT) ** alpha * integral) / (2 * Math.PI);
  return ferriteKi() * deltaB ** (beta - alpha) * mean;
}

export function copperResistance(dcr25Ohm: number, tempC: number): number {
  return dcr25Ohm * (1 + COPPER_TEMPCO * (tempC - 25));
}

export function requiredInductanceH(vin: number, vout: number, iout: number, fHz: number, rippleFraction: number): number {
  const duty = vout / vin;
  const dI = rippleFraction * iout;
  return ((vin - vout) * duty) / (fHz * dI);
}

function pointAt(
  vin: number,
  vout: number,
  iout: number,
  fHz: number,
  lH: number,
  dcr25: number,
  tempC: number,
  isatA: number,
  volumeCm3: number,
  satMargin: number
): InductorPoint {
  const duty = vout / vin;
  const dI = ((vin - vout) * duty) / (fHz * lH);
  const iPeak = iout + dI / 2;
  const iRms = Math.sqrt(iout * iout + (dI * dI) / 12);
  const r = copperResistance(dcr25, tempC);
  const deltaB = FERRITE.bsat * (dI / Math.max(isatA, 1e-6));
  const pCore = igseTriangleWPerM3(fHz, deltaB, duty) * (volumeCm3 * 1e-6);
  const pCopper = iRms * iRms * r;
  return {
    fHz,
    dI,
    iPeak,
    iRms,
    iSatMin: iPeak * (1 + satMargin),
    ccm: dI < 2 * iout,
    pCopper,
    pCore,
    pTotal: pCopper + pCore,
    deltaBT: deltaB
  };
}

export function analyzeInductor(vin: number, vout: number, iout: number, fswHz: number, input: MagneticsInput): InductorDesign {
  const warnings: string[] = [];
  const valid = vin > vout && vout > 0 && iout > 0 && fswHz > 0 && input.rippleFraction > 0 && input.rippleFraction < 2;
  if (!valid) {
    return {
      valid: false,
      duty: 0,
      lH: 0,
      dI: 0,
      iPeak: 0,
      iValley: 0,
      iRms: 0,
      iSatMin: 0,
      dcrOhm: 0,
      pCopper: 0,
      pCore: 0,
      deltaBT: 0,
      warnings: ["Inductor sizing needs Vin > Vout and a positive load current."],
      sweep: []
    };
  }
  const duty = vout / vin;
  const dI = input.rippleFraction * iout;
  const lRequired = ((vin - vout) * duty) / (fswHz * dI);
  const catalog = INDUCTORS.find((item) => item.id === input.inductorId);
  const useCatalog = input.inductorId !== "sized" && catalog;
  const lH = useCatalog ? catalog.lH : lRequired;
  const dcr25 = useCatalog ? catalog.dcr25Ohm : input.dcrMo * 1e-3;
  const isat = useCatalog ? catalog.isatA : (iout + dI / 2) * (1 + input.satMargin);
  const volume = useCatalog ? catalog.volumeCm3 : input.volumeCm3;
  if (input.rippleFraction < 0.2 || input.rippleFraction > 0.4) {
    warnings.push("Ripple fraction is outside the 20–40% CCM design window.");
  }
  const atF = pointAt(vin, vout, iout, fswHz, lH, dcr25, input.tempC, isat, volume, input.satMargin);
  if (!atF.ccm) warnings.push("Ripple exceeds 2·Iout, so the choke is in DCM and the CCM peak formula is no longer the whole story.");
  if (useCatalog && catalog.isatA < atF.iSatMin) {
    warnings.push(`${catalog.mpn} Isat ${catalog.isatA.toFixed(2)} A is under the ${atF.iSatMin.toFixed(2)} A requirement (peak plus ${(input.satMargin * 100).toFixed(0)}%).`);
  }
  if (useCatalog && catalog.lH < lRequired * 0.8) {
    warnings.push(`${catalog.mpn} is ${(catalog.lH * 1e6).toFixed(2)} µH. The ${(input.rippleFraction * 100).toFixed(0)}% ripple target wants ${(lRequired * 1e6).toFixed(2)} µH, so actual ripple is higher.`);
  }
  const sweep: InductorPoint[] = [];
  const fStart = 200e3;
  const fStop = 2.2e6;
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const f = fStart * (fStop / fStart) ** (i / steps);
    sweep.push(pointAt(vin, vout, iout, f, lH, dcr25, input.tempC, isat, volume, input.satMargin));
  }
  return {
    valid: true,
    duty,
    lH,
    dI: atF.dI,
    iPeak: atF.iPeak,
    iValley: iout - atF.dI / 2,
    iRms: atF.iRms,
    iSatMin: atF.iSatMin,
    dcrOhm: copperResistance(dcr25, input.tempC),
    pCopper: atF.pCopper,
    pCore: atF.pCore,
    deltaBT: atF.deltaBT,
    warnings,
    sweep
  };
}

export function mlccDcRetention(caseSize: MlccCase, dielectric: MlccDielectric, vdc: number, vRated: number): number {
  if (vRated <= 0) return 1;
  const fit = MLCC_DC_FIT[caseSize];
  const a = dielectric === "X5R" ? fit.a * X5R_BIAS_SCALE : fit.a;
  const x = Math.max(0, vdc / vRated);
  return 1 / (1 + a * x ** fit.b);
}

export function mlccTempRetention(dielectric: MlccDielectric, tempC: number): { retention: number; outside: boolean } {
  const edge = dielectric === "X7R" ? 125 : 85;
  const span = edge - 25;
  const limited = Math.min(Math.abs(tempC - 25), span);
  let retention = 1 - 0.15 * (limited / span) ** 2;
  const outside = tempC > edge || tempC < -55;
  if (tempC > edge) retention *= Math.max(0.2, 1 - 0.012 * (tempC - edge));
  if (tempC < -55) retention *= Math.max(0.2, 1 - 0.008 * (-55 - tempC));
  return { retention, outside };
}

export function outputRippleV(dI: number, fHz: number, cF: number, esrOhm: number): { cap: number; esr: number; total: number } {
  const cap = cF > 0 && fHz > 0 ? dI / (8 * fHz * cF) : Number.POSITIVE_INFINITY;
  const esr = dI * esrOhm;
  return { cap, esr, total: cap + esr };
}

export function analyzeMlcc(dI: number, fHz: number, input: MagneticsInput): MlccDesign {
  const warnings: string[] = [];
  const cNomEach = input.cNomUf * 1e-6;
  const cNom = cNomEach * input.mlccCount;
  const dc = mlccDcRetention(input.mlccCase, input.mlccDielectric, input.vdc, input.vRated);
  const temp = mlccTempRetention(input.mlccDielectric, input.mlccTempC);
  const retention = dc * temp.retention;
  const cEff = cNom * retention;
  const esr = input.mlccCount > 0 ? (input.esrMo * 1e-3) / input.mlccCount : Number.POSITIVE_INFINITY;
  const ripple = outputRippleV(dI, fHz, cEff, esr);
  const nominal = outputRippleV(dI, fHz, cNom, esr);
  if (input.vdc > input.vRated) warnings.push("DC bias is above the capacitor voltage rating.");
  if (temp.outside) warnings.push(`${input.mlccDielectric} is outside its temperature category at ${input.mlccTempC.toFixed(0)} °C.`);
  if (cNomEach > 0 && input.mlccCase === "0603" && input.vRated <= 6.3 && input.cNomUf >= 22 && input.vdc >= 3.8 && cEff / input.mlccCount < 7e-6) {
    warnings.push("This 0603 is under 7 µF per piece after bias. An 0805 or 1206 keeps more of the nameplate.");
  }
  const curve: MlccPoint[] = [];
  const steps = 32;
  for (let i = 0; i <= steps; i += 1) {
    const vdc = (input.vRated * i) / steps;
    const ret = mlccDcRetention(input.mlccCase, input.mlccDielectric, vdc, input.vRated) * temp.retention;
    const cEffV = cNom * ret;
    curve.push({
      vdc,
      cNominalF: cNom,
      cEffectiveF: cEffV,
      rippleNominalV: outputRippleV(dI, fHz, cNom, esr).total,
      rippleEffectiveV: outputRippleV(dI, fHz, cEffV, esr).total
    });
  }
  return {
    retentionDc: dc,
    retentionTemp: temp.retention,
    retention,
    cEffectiveF: cEff,
    esrParallelOhm: esr,
    rippleCapV: ripple.cap,
    rippleEsrV: ripple.esr,
    rippleV: ripple.total,
    rippleNominalV: nominal.total,
    outsideTempRating: temp.outside,
    curve,
    warnings
  };
}
