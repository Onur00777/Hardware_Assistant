import type { CapacitanceInput } from "../types";

export interface WavePoint {
  tUs: number;
  vBoundary: number;
  vRecommended: number | null;
  iLoadA: number;
  iCapA: number;
}

export interface Simulation {
  points: WavePointCore[];
  vMin: number;
  vMax: number;
  /** Charge removed from the capacitor at the voltage minimum, coulombs. */
  qAtMinC: number;
  tMinS: number;
}

interface WavePointCore {
  tUs: number;
  v: number;
  iLoadA: number;
  iCapA: number;
  iRegA: number;
}

export interface CatalogPart {
  id: string;
  kind: "polymer" | "mlcc";
  name: string;
  /** Nameplate capacitance, farads. */
  cF: number;
  /** Typical impedance-test ESR, ohms. */
  esrOhm: number;
  voltageRating: number;
  /** Bias retention. Polymers are nearly flat; MLCCs use the user value. */
  retention: number;
}

export const POLYMER_RETENTION = 0.95;

/** Typical 100 kHz ESR figures for combination search. Confirm on the datasheet. */
export const CAP_CATALOG: CatalogPart[] = [
  { id: "poly-470-6v3", kind: "polymer", name: "470µF polymer 6.3V", cF: 470e-6, esrOhm: 0.012, voltageRating: 6.3, retention: POLYMER_RETENTION },
  { id: "poly-330-6v3", kind: "polymer", name: "330µF polymer 6.3V", cF: 330e-6, esrOhm: 0.015, voltageRating: 6.3, retention: POLYMER_RETENTION },
  { id: "poly-220-10", kind: "polymer", name: "220µF polymer 10V", cF: 220e-6, esrOhm: 0.018, voltageRating: 10, retention: POLYMER_RETENTION },
  { id: "poly-100-16", kind: "polymer", name: "100µF polymer 16V", cF: 100e-6, esrOhm: 0.025, voltageRating: 16, retention: POLYMER_RETENTION },
  { id: "poly-220-25", kind: "polymer", name: "220µF polymer 25V", cF: 220e-6, esrOhm: 0.035, voltageRating: 25, retention: POLYMER_RETENTION },
  { id: "poly-47-25", kind: "polymer", name: "47µF polymer 25V", cF: 47e-6, esrOhm: 0.04, voltageRating: 25, retention: POLYMER_RETENTION },
  { id: "mlcc-10-25", kind: "mlcc", name: "10µF X7R 0805 25V", cF: 10e-6, esrOhm: 0.008, voltageRating: 25, retention: 1 },
  { id: "mlcc-22-25", kind: "mlcc", name: "22µF X7R 1206 25V", cF: 22e-6, esrOhm: 0.005, voltageRating: 25, retention: 1 },
  { id: "mlcc-22-16", kind: "mlcc", name: "22µF X7R 1206 16V", cF: 22e-6, esrOhm: 0.004, voltageRating: 16, retention: 1 },
  { id: "mlcc-47-16", kind: "mlcc", name: "47µF X7R 1210 16V", cF: 47e-6, esrOhm: 0.004, voltageRating: 16, retention: 1 }
];

export interface CapCombo {
  description: string;
  polymerName: string | null;
  polymerCount: number;
  mlccName: string | null;
  mlccCount: number;
  mlccEachF: number;
  mlccVoltage: number;
  cEffectiveF: number;
  esrOhm: number;
  score: number;
  biasNote: string;
}

export interface CapacitanceResult {
  valid: boolean;
  vNom: number;
  vBrownout: number;
  dropV: number;
  iPeak: number;
  burstS: number;
  responseS: number;
  esrMaxOhm: number;
  esrFraction: number;
  cMinF: number;
  qAtMinC: number;
  boundary: Simulation | null;
  recommended: CapCombo | null;
  recommendedSim: Simulation | null;
  alternatives: CapCombo[];
  warnings: string[];
}

function clampStep(value: number, limit: number): number {
  if (value > limit) return limit;
  if (value < -limit) return -limit;
  return value;
}

export function simulateTransient(
  vNom: number,
  iPeak: number,
  burstS: number,
  responseS: number,
  cF: number,
  esrOhm: number,
  samples = 240
): Simulation {
  const tResponse = Math.max(responseS, 1e-9);
  const tBurst = Math.max(burstS, 1e-9);
  const capacitance = Math.max(cF, 1e-15);
  const tEnd = tBurst + tResponse * 1.8;
  const dtTarget = Math.min(tBurst, tResponse) / 160;
  const steps = Math.max(400, Math.ceil(tEnd / dtTarget));
  const dt = tEnd / steps;
  const slew = iPeak / tResponse;
  let t = 0;
  let iReg = 0;
  let q = 0;
  let vMin = Infinity;
  let vMax = -Infinity;
  let qAtMin = 0;
  let tMin = 0;
  const points: WavePointCore[] = [];
  const stride = Math.max(1, Math.floor(steps / samples));

  for (let step = 0; step <= steps; step += 1) {
    const iLoad = t <= tBurst + dt * 0.5 ? iPeak : 0;
    const iCap = iLoad - iReg;
    const v = vNom - iCap * esrOhm - q / capacitance;
    if (v < vMin) {
      vMin = v;
      qAtMin = q;
      tMin = t;
    }
    if (v > vMax) vMax = v;
    if (step % stride === 0) {
      points.push({ tUs: t * 1e6, v, iLoadA: iLoad, iCapA: iCap, iRegA: iReg });
    }
    const di = slew * dt;
    iReg += clampStep(iLoad - iReg, di);
    q += iCap * dt;
    t += dt;
  }

  return { points, vMin, vMax, qAtMinC: qAtMin, tMinS: tMin };
}

function solveCapacitance(vNom: number, vLimit: number, iPeak: number, burstS: number, responseS: number, esrOhm: number): number {
  const acceptable = (cF: number) => simulateTransient(vNom, iPeak, burstS, responseS, cF, esrOhm, 80).vMin >= vLimit - 1e-4;
  let lo = 1e-9;
  let hi = 1e-5;
  let guard = 0;
  while (!acceptable(hi) && hi < 20 && guard < 40) {
    hi *= 2;
    guard += 1;
  }
  if (!acceptable(hi)) return hi;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (acceptable(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function parallelEsr(n1: number, e1: number, n2: number, e2: number): number {
  let conductance = 0;
  if (n1 > 0 && e1 > 0) conductance += n1 / e1;
  if (n2 > 0 && e2 > 0) conductance += n2 / e2;
  return conductance > 0 ? 1 / conductance : Infinity;
}

function recommend(vNom: number, cMinF: number, esrMaxOhm: number, mlccRetention: number): CapCombo[] {
  const retention = Math.min(0.95, Math.max(0.15, mlccRetention));
  const polymers = CAP_CATALOG.filter((part) => part.kind === "polymer" && part.voltageRating + 1e-9 >= vNom);
  const mlccs = CAP_CATALOG.filter((part) => part.kind === "mlcc" && part.voltageRating + 1e-9 >= vNom);
  const found: CapCombo[] = [];

  const consider = (polymer: CatalogPart | null, np: number, mlcc: CatalogPart | null, nm: number) => {
    if (np + nm === 0) return;
    const cEff =
      (polymer ? np * polymer.cF * polymer.retention : 0) + (mlcc ? nm * mlcc.cF * retention : 0);
    const esr = parallelEsr(np, polymer?.esrOhm ?? Infinity, nm, mlcc?.esrOhm ?? Infinity);
    if (cEff + 1e-12 < cMinF || esr > esrMaxOhm * 1.001) return;
    const parts: string[] = [];
    if (polymer && np > 0) parts.push(`${np}× ${polymer.name}`);
    if (mlcc && nm > 0) parts.push(`${nm}× ${mlcc.name}`);
    const bias =
      mlcc && nm > 0
        ? `MLCC farads are nameplate × ${(retention * 100).toFixed(0)}% DC-bias retention. Polymer uses ${(POLYMER_RETENTION * 100).toFixed(0)}%.`
        : `Polymer capacitance uses ${(POLYMER_RETENTION * 100).toFixed(0)}% of nameplate.`;
    found.push({
      description: parts.join(" + "),
      polymerName: polymer && np > 0 ? polymer.name : null,
      polymerCount: np,
      mlccName: mlcc && nm > 0 ? mlcc.name : null,
      mlccCount: nm,
      mlccEachF: mlcc && nm > 0 ? mlcc.cF : 0,
      mlccVoltage: mlcc && nm > 0 ? mlcc.voltageRating : 0,
      cEffectiveF: cEff,
      esrOhm: esr,
      score: np * 3 + nm + cEff / Math.max(cMinF, 1e-9),
      biasNote: bias
    });
  };

  for (const polymer of polymers) {
    for (let np = 0; np <= 6; np += 1) {
      for (const mlcc of mlccs) {
        for (let nm = 0; nm <= 10; nm += 1) consider(polymer, np, mlcc, nm);
      }
      consider(polymer, np, null, 0);
    }
  }
  for (const mlcc of mlccs) {
    for (let nm = 1; nm <= 10; nm += 1) consider(null, 0, mlcc, nm);
  }

  const unique = new Map<string, CapCombo>();
  for (const combo of found) {
    const existing = unique.get(combo.description);
    if (!existing || combo.score < existing.score) unique.set(combo.description, combo);
  }
  const list = [...unique.values()];
  const byScore = (a: CapCombo, b: CapCombo) => a.score - b.score || a.esrOhm - b.esrOhm;
  const layout = (a: CapCombo, b: CapCombo) => {
    if (a.polymerCount !== b.polymerCount) return a.polymerCount - b.polymerCount;
    const aBulkCeramic = a.mlccCount >= 2 && a.mlccEachF >= 22e-6 ? 0 : 1;
    const bBulkCeramic = b.mlccCount >= 2 && b.mlccEachF >= 22e-6 ? 0 : 1;
    if (aBulkCeramic !== bBulkCeramic) return aBulkCeramic - bBulkCeramic;
    if (a.mlccCount !== b.mlccCount) return a.mlccCount - b.mlccCount;
    if (a.mlccVoltage !== b.mlccVoltage) return b.mlccVoltage - a.mlccVoltage;
    if (Math.abs(a.esrOhm - b.esrOhm) > 1e-5) return a.esrOhm - b.esrOhm;
    return a.cEffectiveF - b.cEffectiveF;
  };
  const preferred = list.filter((combo) => combo.polymerCount >= 1 && combo.mlccCount >= 2).sort(layout);
  const polyOnly = list.filter((combo) => combo.polymerCount >= 1 && combo.mlccCount === 0).sort(byScore);
  const mlccOnly = list.filter((combo) => combo.polymerCount === 0 && combo.mlccCount >= 1).sort(byScore);
  list.sort(byScore);

  const out: CapCombo[] = [];
  const push = (combo: CapCombo | undefined) => {
    if (!combo) return;
    if (out.some((item) => item.description === combo.description)) return;
    out.push(combo);
  };
  push(preferred[0]);
  push(polyOnly[0]);
  push(mlccOnly[0]);
  for (const combo of list) {
    if (out.length >= 3) break;
    push(combo);
  }
  return out.slice(0, 3);
}

export function analyzeCapacitance(input: CapacitanceInput): CapacitanceResult {
  const warnings: string[] = [];
  const vNom = input.vNom;
  const dropV = input.dropMv / 1000;
  const iPeak = input.iPeak;
  const burstS = input.burstUs * 1e-6;
  const responseS = input.responseUs * 1e-6;
  const esrFraction = Math.min(0.75, Math.max(0.05, input.esrFraction));
  const base = {
    vNom,
    vBrownout: vNom - dropV,
    dropV,
    iPeak,
    burstS,
    responseS,
    esrMaxOhm: 0,
    esrFraction,
    cMinF: 0,
    qAtMinC: 0,
    boundary: null,
    recommended: null,
    recommendedSim: null,
    alternatives: [] as CapCombo[],
    warnings
  };

  if (!(vNom > dropV) || !(dropV > 0) || !(iPeak > 0) || !(burstS > 0) || !(responseS > 0)) {
    warnings.push("Voltage, droop, peak current, burst length, and response time all have to be positive, and the droop has to stay inside the rail.");
    return { ...base, valid: false };
  }

  const esrMaxOhm = (esrFraction * dropV) / iPeak;
  const vLimit = vNom - dropV;
  const cMinF = solveCapacitance(vNom, vLimit, iPeak, burstS, responseS, esrMaxOhm);
  const boundary = simulateTransient(vNom, iPeak, burstS, responseS, cMinF, esrMaxOhm, 220);
  const alternatives = recommend(vNom, cMinF, esrMaxOhm, input.mlccRetention);
  const recommended = alternatives[0] ?? null;
  const recommendedSim = recommended
    ? simulateTransient(vNom, iPeak, burstS, responseS, recommended.cEffectiveF, recommended.esrOhm, 220)
    : null;

  if (boundary.vMin < vLimit - 0.01) {
    warnings.push("The capacitance search did not land on the brownout line. Treat Cmin as a lower bound and add margin.");
  }
  if (cMinF > 1500e-6) {
    warnings.push("Hold-up wants more than 1500 µF. A faster loop, or a battery on this rail, is the practical fix. The capacitor is being asked to replace the source.");
  }
  if (!recommended) {
    warnings.push("No catalog combination meets both Cmin and ESRmax at this voltage. The required C and ESR are still valid — the part list is not.");
  }
  const tightPolymer = CAP_CATALOG.some(
    (part) => part.kind === "polymer" && part.voltageRating >= vNom && vNom > part.voltageRating * 0.8
  );
  if (tightPolymer) {
    warnings.push("At least one polymer in the catalog is above 80% of its voltage rating at this rail. Check ripple current and bias before you lock the BOM.");
  }
  if (responseS >= burstS) {
    warnings.push("The converter is still slewing when the burst ends, so the capacitor carries the whole pulse. Shorten the loop if you need a smaller bank.");
  }

  return {
    valid: true,
    vNom,
    vBrownout: vLimit,
    dropV,
    iPeak,
    burstS,
    responseS,
    esrMaxOhm,
    esrFraction,
    cMinF,
    qAtMinC: boundary.qAtMinC,
    boundary,
    recommended,
    recommendedSim,
    alternatives,
    warnings
  };
}

export function zipWaveforms(result: CapacitanceResult): WavePoint[] {
  if (!result.boundary) return [];
  const other = result.recommendedSim?.points ?? [];
  return result.boundary.points.map((point, index) => ({
    tUs: point.tUs,
    vBoundary: point.v,
    vRecommended: other[index]?.v ?? null,
    iLoadA: point.iLoadA,
    iCapA: point.iCapA
  }));
}
