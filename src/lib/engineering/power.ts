import type { Load, LoadMode, Rail } from "../types";
import { sizeTrace, type TraceSizing } from "./ipc2152";

export const SCENARIOS = ["idle", "active", "mission", "peak"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_META: Record<Scenario, { label: string; detail: string }> = {
  idle: { label: "Idle", detail: "Idle rows only, at I · D" },
  active: { label: "Active", detail: "Active rows only, at I · D" },
  mission: { label: "Mission", detail: "Active plus burst, at I · D" },
  peak: { label: "Peak", detail: "Active and burst fully on together" }
};

/** Automotive mini / ATO blade ratings, amperes. */
export const BLADE_FUSES_A = [0.5, 1, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60];

export interface CurrentStats {
  iAvgA: number;
  iRmsA: number;
  iPeakA: number;
}

export interface RailReport {
  id: string;
  name: string;
  kind: Rail["kind"];
  voltage: number;
  parentId: string | null;
  efficiencyPct: number;
  iqMa: number;
  depth: number;
  own: Record<Scenario, CurrentStats>;
  downstream: Record<Scenario, CurrentStats>;
  out: Record<Scenario, CurrentStats>;
  drawn: Record<Scenario, CurrentStats>;
  pOutW: Record<Scenario, number>;
  pInW: Record<Scenario, number>;
  lossW: Record<Scenario, number>;
  /** Referral gain from this rail's output current to the current drawn from the parent. */
  referralK: number;
  trace: TraceSizing;
  problems: string[];
}

export interface ScenarioReport {
  inputPowerW: number;
  loadPowerW: number;
  lossW: number;
  inputAvgA: number;
  inputRmsA: number;
  inputPeakA: number;
  balanceErrorW: number;
}

export interface FuseRecommendation {
  iRmsA: number;
  iPeakA: number;
  /** rating >= I_rms / 0.75, so continuous loading stays at or below 75%. */
  minRatingA: number;
  ratingA: number;
  loadingPct: number;
  peakExceedsRating: boolean;
  negligible: boolean;
  series: number[];
}

export interface PowerResult {
  rails: RailReport[];
  sourceIds: string[];
  scenarios: Record<Scenario, ScenarioReport>;
  fuse: FuseRecommendation;
  /** Trace on the first source, sized from mission RMS. */
  sourceTrace: TraceSizing;
  warnings: string[];
}

function zeros(): CurrentStats {
  return { iAvgA: 0, iRmsA: 0, iPeakA: 0 };
}

function scenarioRecord<T>(make: () => T): Record<Scenario, T> {
  return {
    idle: make(),
    active: make(),
    mission: make(),
    peak: make()
  };
}

export function modeIncluded(mode: LoadMode, scenario: Scenario): boolean {
  if (scenario === "idle") return mode === "idle";
  if (scenario === "active") return mode === "active";
  return mode === "active" || mode === "burst";
}

/**
 * Uncorrelated rectangular loads.
 * A single pulsed load collapses to I·√D. Constant loads (D = 1) add arithmetically.
 * Coincident peak is the arithmetic sum and is reported separately.
 */
export function combineCurrents(parts: CurrentStats[]): CurrentStats {
  let iAvg = 0;
  let variance = 0;
  let iPeak = 0;
  for (const part of parts) {
    iAvg += part.iAvgA;
    variance += Math.max(0, part.iRmsA * part.iRmsA - part.iAvgA * part.iAvgA);
    iPeak += part.iPeakA;
  }
  return {
    iAvgA: iAvg,
    iRmsA: Math.sqrt(Math.max(0, iAvg * iAvg + variance)),
    iPeakA: iPeak
  };
}

function loadStats(loads: Load[], scenario: Scenario): CurrentStats {
  let iAvg = 0;
  let variance = 0;
  let iPeak = 0;
  for (const load of loads) {
    if (!modeIncluded(load.mode, scenario)) continue;
    const i = Math.max(0, load.currentMa) / 1000;
    const duty = scenario === "peak" ? 1 : Math.min(1, Math.max(0, load.dutyPct / 100));
    iAvg += i * duty;
    variance += i * i * duty * (1 - duty);
    iPeak += i;
  }
  return {
    iAvgA: iAvg,
    iRmsA: Math.sqrt(Math.max(0, iAvg * iAvg + variance)),
    iPeakA: iPeak
  };
}

function refer(kind: Rail["kind"], out: CurrentStats, k: number, iqA: number): CurrentStats {
  if (kind === "source") return { ...out };
  const iAvg = k * out.iAvgA + iqA;
  const convRms = k * out.iRmsA;
  const iRms = Math.sqrt(Math.max(0, convRms * convRms + iqA * iqA + 2 * iqA * k * out.iAvgA));
  return { iAvgA: iAvg, iRmsA: iRms, iPeakA: k * out.iPeakA + iqA };
}

export function recommendFuse(iRmsA: number, iPeakA: number): FuseRecommendation {
  const iRms = Math.max(0, iRmsA);
  const iPeak = Math.max(0, iPeakA);
  const negligible = iRms < 0.02 && iPeak < 0.05;
  const minRatingA = negligible ? 0.5 : iRms / 0.75;
  const ratingA = BLADE_FUSES_A.find((rating) => rating + 1e-9 >= minRatingA) ?? BLADE_FUSES_A[BLADE_FUSES_A.length - 1];
  return {
    iRmsA: iRms,
    iPeakA: iPeak,
    minRatingA,
    ratingA,
    loadingPct: ratingA > 0 ? (iRms / ratingA) * 100 : 0,
    peakExceedsRating: iPeak > ratingA + 1e-9,
    negligible,
    series: BLADE_FUSES_A
  };
}

function descendantsOf(rails: Rail[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const rail of rails) {
    if (!rail.parentId) continue;
    const list = children.get(rail.parentId) ?? [];
    list.push(rail.id);
    children.set(rail.parentId, list);
  }
  const out = new Set<string>();
  const walk = (current: string) => {
    for (const child of children.get(current) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      walk(child);
    }
  };
  walk(id);
  return out;
}

export function parentChoices(rails: Rail[], railId: string): Rail[] {
  const banned = descendantsOf(rails, railId);
  banned.add(railId);
  return rails.filter((rail) => !banned.has(rail.id));
}

export function analyzePower(rails: Rail[], loads: Load[], traceRiseC: number): PowerResult {
  const warnings: string[] = [];
  const byId = new Map(rails.map((rail) => [rail.id, rail]));
  const loadsByRail = new Map<string, Load[]>();
  for (const load of loads) {
    const list = loadsByRail.get(load.railId) ?? [];
    list.push(load);
    loadsByRail.set(load.railId, list);
  }

  const childrenOf = new Map<string, Rail[]>();
  for (const rail of rails) {
    if (!rail.parentId) continue;
    if (!byId.has(rail.parentId)) {
      warnings.push(`${rail.name} has no parent rail and was left out of the referral.`);
      continue;
    }
    const list = childrenOf.get(rail.parentId) ?? [];
    list.push(rail);
    childrenOf.set(rail.parentId, list);
  }

  const solved = new Map<string, RailReport>();
  const stack = new Set<string>();

  function emptyReport(rail: Rail, problem: string): RailReport {
    const zero = scenarioRecord(zeros);
    const zeroN = scenarioRecord(() => 0);
    return {
      id: rail.id,
      name: rail.name,
      kind: rail.kind,
      voltage: rail.voltage,
      parentId: rail.parentId,
      efficiencyPct: rail.efficiencyPct,
      iqMa: rail.iqMa,
      depth: 0,
      own: zero,
      downstream: scenarioRecord(zeros),
      out: zero,
      drawn: zero,
      pOutW: zeroN,
      pInW: zeroN,
      lossW: zeroN,
      referralK: 0,
      trace: sizeTrace(0, traceRiseC),
      problems: [problem]
    };
  }

  function solve(id: string): RailReport {
    const cached = solved.get(id);
    if (cached) return cached;
    const rail = byId.get(id);
    if (!rail) {
      throw new Error(`Missing rail ${id}`);
    }
    if (stack.has(id)) {
      const report = emptyReport(rail, `${rail.name} is part of a cycle and was not solved.`);
      warnings.push(report.problems[0]);
      return report;
    }
    stack.add(id);

    const problems: string[] = [];
    const own = scenarioRecord(zeros);
    for (const scenario of SCENARIOS) {
      own[scenario] = loadStats(loadsByRail.get(id) ?? [], scenario);
    }

    const downstream = scenarioRecord(zeros);
    for (const child of childrenOf.get(id) ?? []) {
      const childReport = solve(child.id);
      for (const scenario of SCENARIOS) {
        downstream[scenario] = combineCurrents([downstream[scenario], childReport.drawn[scenario]]);
      }
    }

    const out = scenarioRecord(zeros);
    for (const scenario of SCENARIOS) {
      out[scenario] = combineCurrents([own[scenario], downstream[scenario]]);
    }

    const parent = rail.parentId ? byId.get(rail.parentId) : undefined;
    const vin = parent?.voltage ?? rail.voltage;
    const vout = rail.voltage;
    const iqA = Math.max(0, rail.iqMa) / 1000;
    let k = 1;
    if (rail.kind === "buck") {
      const eta = Math.min(0.99, Math.max(0.05, rail.efficiencyPct / 100));
      if (!(vin > vout) || !(vin > 0) || !(vout > 0)) {
        problems.push(`${rail.name}: a buck needs the parent above this rail.`);
        k = 0;
      } else {
        k = vout / (vin * eta);
      }
    } else if (rail.kind === "ldo") {
      if (!(vin > vout) || !(vout > 0)) {
        problems.push(`${rail.name}: an LDO needs headroom above ${vout.toFixed(2)} V.`);
      }
      k = 1;
    } else {
      k = 1;
    }

    if (!(vout > 0)) problems.push(`${rail.name}: voltage must be positive.`);

    const drawn = scenarioRecord(zeros);
    const pOutW = scenarioRecord(() => 0);
    const pInW = scenarioRecord(() => 0);
    const lossW = scenarioRecord(() => 0);

    for (const scenario of SCENARIOS) {
      const pOut = (vout > 0 ? vout : 0) * out[scenario].iAvgA;
      pOutW[scenario] = pOut;
      if (rail.kind === "source") {
        drawn[scenario] = { ...out[scenario] };
        pInW[scenario] = pOut;
        lossW[scenario] = 0;
      } else if (rail.kind === "ldo") {
        drawn[scenario] = refer("ldo", out[scenario], 1, iqA);
        const pIn = (vin > 0 ? vin : 0) * drawn[scenario].iAvgA;
        pInW[scenario] = pIn;
        lossW[scenario] = pIn - pOut;
      } else {
        const eta = Math.min(0.99, Math.max(0.05, rail.efficiencyPct / 100));
        drawn[scenario] = refer("buck", out[scenario], k, iqA);
        const pIn = (vout > 0 && vin > vout ? pOut / eta : 0) + (vin > 0 ? vin * iqA : 0);
        pInW[scenario] = pIn;
        lossW[scenario] = pIn - pOut;
      }
    }

    const report: RailReport = {
      id: rail.id,
      name: rail.name,
      kind: rail.kind,
      voltage: vout,
      parentId: rail.parentId,
      efficiencyPct: rail.efficiencyPct,
      iqMa: rail.iqMa,
      depth: 0,
      own,
      downstream,
      out,
      drawn,
      pOutW,
      pInW,
      lossW,
      referralK: rail.kind === "source" ? 1 : k,
      trace: sizeTrace(out.mission.iRmsA, traceRiseC),
      problems
    };
    solved.set(id, report);
    stack.delete(id);
    return report;
  }

  const roots = rails.filter((rail) => rail.parentId === null || !byId.has(rail.parentId ?? ""));
  for (const root of roots) solve(root.id);
  for (const rail of rails) {
    if (!solved.has(rail.id)) solve(rail.id);
  }

  function depthOf(id: string): number {
    let depth = 0;
    let cursor = byId.get(id);
    const seen = new Set<string>();
    while (cursor?.parentId && byId.has(cursor.parentId)) {
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      depth += 1;
      cursor = byId.get(cursor.parentId);
    }
    return depth;
  }

  const reports = rails
    .map((rail) => {
      const report = solved.get(rail.id)!;
      report.depth = depthOf(rail.id);
      return report;
    })
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

  const sources = reports.filter((rail) => rail.kind === "source");
  if (sources.length === 0) warnings.push("Add a source rail. The fuse and input trace need one.");
  if (sources.length > 1) warnings.push("More than one source is present. The fuse uses the first source only.");

  const scenarios = scenarioRecord<ScenarioReport>(() => ({
    inputPowerW: 0,
    loadPowerW: 0,
    lossW: 0,
    inputAvgA: 0,
    inputRmsA: 0,
    inputPeakA: 0,
    balanceErrorW: 0
  }));

  for (const scenario of SCENARIOS) {
    const loadPowerW = reports.reduce((sum, rail) => sum + rail.voltage * rail.own[scenario].iAvgA, 0);
    const lossW = reports.reduce((sum, rail) => sum + rail.lossW[scenario], 0);
    const sourceCurrents = combineCurrents(sources.map((rail) => rail.out[scenario]));
    const inputPowerW = sources.reduce((sum, rail) => sum + rail.pInW[scenario], 0);
    scenarios[scenario] = {
      inputPowerW,
      loadPowerW,
      lossW,
      inputAvgA: sourceCurrents.iAvgA,
      inputRmsA: sourceCurrents.iRmsA,
      inputPeakA: sourceCurrents.iPeakA,
      balanceErrorW: inputPowerW - loadPowerW - lossW
    };
  }

  const primary = sources[0];
  const fuse = recommendFuse(
    primary?.out.mission.iRmsA ?? 0,
    primary?.out.peak.iPeakA ?? 0
  );
  if (fuse.negligible) {
    warnings.push("Mission current is negligible. 0.5 A is a practical minimum, not a thermal result.");
  } else if (fuse.peakExceedsRating) {
    warnings.push(
      `Coincident peak ${fuse.iPeakA.toFixed(2)} A is above the ${fuse.ratingA} A fuse. A long overlap can open it. A 577 µs radio burst will not, but confirm the time-current curve — this is not an I²t model.`
    );
  }
  if (fuse.ratingA === BLADE_FUSES_A[BLADE_FUSES_A.length - 1] && fuse.minRatingA > fuse.ratingA) {
    warnings.push("Mission RMS is above the largest blade fuse in the series. Use a different fuse family or split the feed.");
  }

  for (const rail of reports) {
    for (const problem of rail.problems) warnings.push(problem);
    if (rail.trace.usePour) {
      warnings.push(`${rail.name}: mission RMS wants a pour wider than 5 mm. Use a polygon, not a single neck.`);
    }
  }

  for (const load of loads) {
    if (!byId.has(load.railId)) warnings.push(`${load.name} is attached to a missing rail.`);
  }

  return {
    rails: reports,
    sourceIds: sources.map((rail) => rail.id),
    scenarios,
    fuse,
    sourceTrace: primary?.trace ?? sizeTrace(0, traceRiseC),
    warnings
  };
}
