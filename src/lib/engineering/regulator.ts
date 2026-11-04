import type { PackageId, RegulatorArch, RegulatorInput } from "../types";

export interface PackageSpec {
  id: PackageId;
  label: string;
  rthJA: number;
  note: string;
}

/**
 * Typical still-air θJA values for a first sizing pass.
 * SOT-23 matches the JEDEC figure published for small LDOs (about 237 °C/W).
 * The others are recommended-copper values, not minimum-pad numbers.
 * Use the datasheet override when the footprint is known.
 */
export const PACKAGES: PackageSpec[] = [
  {
    id: "SOT-23",
    label: "SOT-23",
    rthJA: 236,
    note: "JEDEC SOT-23-5, minimal copper, about 237 °C/W."
  },
  {
    id: "SOT-223",
    label: "SOT-223",
    rthJA: 62,
    note: "Tab into roughly 0.5–1 in² of copper. A bare pad is closer to 110–140 °C/W."
  },
  {
    id: "SOIC-8",
    label: "SOIC-8",
    rthJA: 116,
    note: "Narrow-body SOIC-8 with no exposed pad."
  },
  {
    id: "DPAK",
    label: "DPAK",
    rthJA: 50,
    note: "TO-252 with the tab on a copper pour."
  },
  {
    id: "QFN",
    label: "QFN",
    rthJA: 35,
    note: "Exposed-pad QFN, vias into an inner plane, about 35 °C/W."
  }
];

export type ThermalZoneId = "safe" | "warning" | "derate" | "shutdown";

export interface ThermalZone {
  id: ThermalZoneId;
  label: string;
  detail: string;
}

export function thermalZone(tj: number): ThermalZone {
  if (!Number.isFinite(tj)) {
    return { id: "shutdown", label: "Invalid", detail: "Junction temperature is not a number." };
  }
  if (tj < 70) return { id: "safe", label: "Safe", detail: "Junction under 70 °C." };
  if (tj <= 100) return { id: "warning", label: "Warning", detail: "70–100 °C. Confirm the datasheet derating." };
  if (tj <= 115) return { id: "derate", label: "Derate", detail: "100–115 °C. Above the warning band, below the 115 °C shutdown line." };
  return { id: "shutdown", label: "Thermal shutdown", detail: "Above 115 °C. Treat this as out of design limits." };
}

export interface LossTerm {
  id: string;
  label: string;
  watts: number;
  /** Included in the package junction rise. Inductor DCR is not. */
  inPackage: boolean;
}

export interface RegulatorPoint {
  iout: number;
  efficiencyPct: number;
  tj: number;
  pLossW: number;
  pPackageW: number;
}

export interface RegulatorResult {
  valid: boolean;
  architecture: RegulatorArch;
  duty: number | null;
  pOutW: number;
  pLossW: number;
  pPackageW: number;
  pInductorW: number;
  efficiencyPct: number;
  tj: number;
  rthJA: number;
  rthNote: string;
  overridden: boolean;
  zone: ThermalZone;
  terms: LossTerm[];
  warnings: string[];
}

export function packageById(id: PackageId): PackageSpec {
  return PACKAGES.find((item) => item.id === id) ?? PACKAGES[0];
}

function emptyTerms(): LossTerm[] {
  return [];
}

export function analyzeRegulator(input: RegulatorInput): RegulatorResult {
  const pkg = packageById(input.packageId);
  const overridden = input.rthOverride !== null && Number.isFinite(input.rthOverride);
  const rthJA = overridden ? Math.max(0.1, input.rthOverride as number) : pkg.rthJA;
  const warnings: string[] = [];
  const vin = input.vin;
  const vout = input.vout;
  const iout = Math.max(0, input.iout);
  const iq = Math.max(0, input.iqMa) / 1000;
  const ta = input.ta;
  const pOutW = vout > 0 ? vout * iout : 0;

  const fail = (warning: string, duty: number | null): RegulatorResult => {
    warnings.push(warning);
    const zone = thermalZone(ta);
    return {
      valid: false,
      architecture: input.architecture,
      duty,
      pOutW,
      pLossW: 0,
      pPackageW: 0,
      pInductorW: 0,
      efficiencyPct: Number.NaN,
      tj: ta,
      rthJA,
      rthNote: overridden ? "Datasheet θJA override." : pkg.note,
      overridden,
      zone,
      terms: emptyTerms(),
      warnings
    };
  };

  if (!(vin > 0) || !(vout > 0) || !(rthJA > 0)) {
    return fail("Vin, Vout, and θJA must be positive.", null);
  }

  if (input.architecture === "ldo") {
    if (vin <= vout) {
      return fail("LDO is in dropout. Vin has to sit above Vout by the datasheet headroom.", null);
    }
    const pPass = (vin - vout) * iout;
    const pIq = vin * iq;
    const pLossW = pPass + pIq;
    const efficiencyPct = pOutW + pLossW > 0 ? (100 * pOutW) / (pOutW + pLossW) : 0;
    const tj = ta + pLossW * rthJA;
    if (tj > 150) warnings.push("Above 150 °C, past typical automotive silicon Tⱼ max even where the meter is already red.");
    else if (tj > 125) warnings.push("Above 125 °C. Many commercial dies are already outside their operating area.");
    if (pPass > 1) warnings.push("Pass-element loss is over 1 W. A buck is usually the right architecture here.");
    return {
      valid: true,
      architecture: "ldo",
      duty: null,
      pOutW,
      pLossW,
      pPackageW: pLossW,
      pInductorW: 0,
      efficiencyPct,
      tj,
      rthJA,
      rthNote: overridden ? "Datasheet θJA override." : pkg.note,
      overridden,
      zone: thermalZone(tj),
      terms: [
        { id: "pass", label: "(Vin − Vout) · Iout", watts: pPass, inPackage: true },
        { id: "iq", label: "Vin · Iq", watts: pIq, inPackage: true }
      ],
      warnings
    };
  }

  if (vin <= vout) {
    return fail("Buck cannot regulate. Vin must exceed Vout.", vout / vin);
  }

  const duty = vout / vin;
  const fsw = Math.max(0, input.fswKhz) * 1e3;
  const rdsHs = Math.max(0, input.rdsHsMo) * 1e-3;
  const rdsLs = Math.max(0, input.rdsLsMo) * 1e-3;
  const tr = Math.max(0, input.trNs) * 1e-9;
  const tf = Math.max(0, input.tfNs) * 1e-9;
  const tDead = Math.max(0, input.tDeadNs) * 1e-9;
  const dcr = Math.max(0, input.dcrMo) * 1e-3;
  const qg = Math.max(0, input.qgNc) * 1e-9;
  const vsd = Math.max(0, input.vsd);
  const vdrive = Math.max(0, input.vdrive);

  const pCond = iout * iout * (duty * rdsHs + (1 - duty) * rdsLs);
  const pSw = 0.5 * vin * iout * (tr + tf) * fsw;
  const pDead = vsd * iout * tDead * fsw;
  const pGate = qg * vdrive * fsw;
  const pIq = vin * iq;
  const pInductorW = iout * iout * dcr;
  const pPackageW = pCond + pSw + pDead + pGate + pIq;
  const pLossW = pPackageW + pInductorW;
  const efficiencyPct = pOutW + pLossW > 0 ? (100 * pOutW) / (pOutW + pLossW) : 0;
  const tj = ta + pPackageW * rthJA;

  if (duty > 0.9) warnings.push("Ideal duty is over 90%. There is little room for drops and the off-time.");
  if (fsw === 0) warnings.push("Switching frequency is zero, so switching, dead-time, and gate loss are omitted.");
  if (tj > 150) warnings.push("Package dissipation puts Tⱼ above 150 °C.");
  else if (tj > 125) warnings.push("Package dissipation puts Tⱼ above 125 °C.");
  if (efficiencyPct < 70 && iout > 0.05) {
    warnings.push("Efficiency is under 70% at this load. Check Rds(on), switching time, and frequency.");
  }

  return {
    valid: true,
    architecture: "buck",
    duty,
    pOutW,
    pLossW,
    pPackageW,
    pInductorW,
    efficiencyPct,
    tj,
    rthJA,
    rthNote: overridden ? "Datasheet θJA override." : pkg.note,
    overridden,
    zone: thermalZone(tj),
    terms: [
      { id: "cond", label: "Iout² · (D·RdsHS + (1−D)·RdsLS)", watts: pCond, inPackage: true },
      { id: "sw", label: "½ · Vin · Iout · (tr+tf) · fsw", watts: pSw, inPackage: true },
      { id: "dead", label: "Vsd · Iout · tdead · fsw", watts: pDead, inPackage: true },
      { id: "gate", label: "Qg · Vdrive · fsw", watts: pGate, inPackage: true },
      { id: "iq", label: "Vin · Iq", watts: pIq, inPackage: true },
      { id: "dcr", label: "Iout² · DCR (inductor, not in Tⱼ)", watts: pInductorW, inPackage: false }
    ],
    warnings
  };
}

export function regulatorCurve(input: RegulatorInput, count = 48): RegulatorPoint[] {
  const iMax = Math.max(input.iout * 1.5, 0.5);
  const points: RegulatorPoint[] = [];
  const steps = Math.max(2, count);
  for (let i = 0; i <= steps; i += 1) {
    const iout = (iMax * i) / steps;
    const result = analyzeRegulator({ ...input, iout });
    points.push({
      iout,
      efficiencyPct: result.valid ? result.efficiencyPct : 0,
      tj: result.tj,
      pLossW: result.pLossW,
      pPackageW: result.pPackageW
    });
  }
  return points;
}
