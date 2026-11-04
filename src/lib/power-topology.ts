import type { CapacitanceResult } from "./engineering/capacitance";
import type { ChannelReport, HarnessResult } from "./engineering/harness";
import { modeIncluded, type PowerResult, type RailReport, type Scenario } from "./engineering/power";
import type { ProtectionResult } from "./engineering/protection";
import { thermalZone, type RegulatorResult } from "./engineering/regulator";
import { fmtA, fmtV } from "./format";
import { studioToolLabel, type StudioToolId } from "./studio-nav";
import type { Load, Project } from "./types";

export type TopologyKind = "feed" | "protection" | "buck" | "ldo" | "load";
export type TopologyStatus = "ok" | "fault";

export interface TopologyNode {
  id: string;
  kind: TopologyKind;
  title: string;
  voltageLabel: string;
  rmsLabel: string;
  efficiencyLabel: string;
  thermalLabel: string;
  status: TopologyStatus;
  tool: StudioToolId;
  toolLabel: string;
  column: number;
  row: number;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  fault: boolean;
}

export interface TopologyModel {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

interface TopologyInput {
  project: Project;
  power: PowerResult;
  protection: ProtectionResult;
  regulator: RegulatorResult;
  capacitance: CapacitanceResult;
  harness: HarnessResult;
  scenario: Scenario;
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function loadRmsA(load: Load, scenario: Scenario): number {
  if (!modeIncluded(load.mode, scenario)) return 0;
  const currentA = Math.max(0, load.currentMa) / 1000;
  const duty = scenario === "peak" ? 1 : Math.min(1, Math.max(0, load.dutyPct / 100));
  return currentA * Math.sqrt(duty);
}

function closestRail(rails: RailReport[], voltage: number, kinds: RailReport["kind"][]): RailReport | undefined {
  const pool = rails.filter((rail) => kinds.includes(rail.kind));
  return [...pool].sort((a, b) => Math.abs(a.voltage - voltage) - Math.abs(b.voltage - voltage))[0];
}

function toolForLoad(name: string): StudioToolId {
  if (/can/i.test(name)) return "can";
  if (/imu|adc|apps|bse|sensor|ntc|gnss|gps|transducer/i.test(name)) return "analog";
  if (/fan|pump|brake|shutdown|lamp|driver|high-side/i.test(name)) return "harness";
  if (/lte|modem|gsm|sd card|sdmmc/i.test(name)) return "bulk";
  return "power";
}

function toolForRail(rail: RailReport): StudioToolId {
  if (rail.kind === "source") return "protect";
  if (rail.id === "rail3v8" || /lte|3v8|3\.8/i.test(rail.name)) return "bulk";
  return "thermal";
}

function harnessTrip(report: ChannelReport): boolean {
  if (!report.part) return false;
  return report.tjC >= report.part.tsdC || report.tjInrushC >= report.part.tsdC;
}

function protectionId(sourceId: string): string {
  return `protect:${sourceId}`;
}

/**
 * Board power graph: source, series reverse-polarity / TVS stage, converters, then loads.
 * A node is faulted when its own check trips: regulator junction at the 115 °C shutdown
 * line, LTE bulk below brownout, a high-side switch at thermal shutdown, or a TVS that
 * cannot stand off or clamp inside the downstream absolute maximum.
 */
export function buildPowerTopology(input: TopologyInput): TopologyModel {
  const { project, power, protection, regulator, capacitance, harness, scenario } = input;
  const rails = power.rails;
  const sources = rails.filter((rail) => rail.kind === "source");
  const feed = sources[0];
  const regulatorRail = closestRail(rails, project.regulator.vout, [project.regulator.architecture]);
  const droopRail = closestRail(
    rails.filter((rail) => rail.kind !== "source"),
    project.capacitance.vNom,
    ["buck", "ldo"]
  );
  const regulatorShutdown =
    regulatorRail !== undefined && (!regulator.valid || thermalZone(regulator.tj).id === "shutdown");
  const sim = capacitance.recommendedSim;
  const droopFault = Boolean(sim && sim.vMin + 1e-9 < capacitance.vBrownout);
  const droopApplies = droopRail !== undefined && Math.abs(droopRail.voltage - project.capacitance.vNom) <= 0.35;
  const trippedChannels = harness.channels.filter(harnessTrip);
  const harnessFault = trippedChannels.length > 0;
  const clampFault = !protection.tvs.clampOk || !protection.tvs.standoffOk;
  const ideal = protection.polarity.find((row) => row.id === "ideal");

  const draft: Array<Omit<TopologyNode, "row" | "toolLabel"> & { sort: number }> = [];
  const links: Array<{ source: string; target: string }> = [];

  sources.forEach((source, index) => {
    const sourceFault = harnessFault && source.id === (feed?.id ?? source.id);
    const worstHarness = harness.channels.reduce((max, row) => Math.max(max, row.tjC, row.tjInrushC), project.harness.ta);
    draft.push({
      id: source.id,
      kind: "feed",
      title: source.name,
      voltageLabel: fmtV(source.voltage),
      rmsLabel: fmtA(source.out[scenario].iRmsA),
      efficiencyLabel: "100%",
      thermalLabel: sourceFault ? `TSD ${worstHarness.toFixed(0)}°C` : `Fuse ${power.fuse.ratingA} A`,
      status: sourceFault ? "fault" : "ok",
      tool: "protect",
      column: 0,
      sort: index
    });
    const guardId = protectionId(source.id);
    const pin = source.pOutW[scenario];
    const diodeLoss = ideal?.lossRmsW ?? 0;
    const diodeEta = pin > 1e-6 ? (100 * Math.max(0, pin - diodeLoss)) / pin : 100;
    draft.push({
      id: guardId,
      kind: "protection",
      title: "Reverse polarity / TVS",
      voltageLabel: fmtV(source.voltage),
      rmsLabel: fmtA(source.out[scenario].iRmsA),
      efficiencyLabel: pct(diodeEta),
      thermalLabel: clampFault ? "Clamp fail" : `TVS ${protection.tvs.marginV.toFixed(1)} V`,
      status: clampFault ? "fault" : "ok",
      tool: "protect",
      column: 1,
      sort: index
    });
    links.push({ source: source.id, target: guardId });
  });

  for (const rail of rails) {
    if (rail.kind === "source") continue;
    const parent = rails.find((item) => item.id === rail.parentId);
    const shutdownHere = regulatorShutdown && regulatorRail?.id === rail.id;
    const droopHere = droopFault && droopApplies && droopRail?.id === rail.id;
    const ldoEta = parent && parent.voltage > 0 ? (100 * rail.voltage) / parent.voltage : Number.NaN;
    let thermalLabel = `Loss ${rail.lossW[scenario].toFixed(2)} W`;
    if (shutdownHere) thermalLabel = `TSD ${regulator.tj.toFixed(0)}°C`;
    else if (regulatorRail?.id === rail.id && regulator.valid) thermalLabel = `${regulator.tj.toFixed(0)}°C`;
    if (droopHere) thermalLabel = "Droop";
    else if (droopApplies && droopRail?.id === rail.id && sim) {
      thermalLabel = `${((sim.vMin - capacitance.vBrownout) * 1e3).toFixed(0)} mV`;
    }
    draft.push({
      id: rail.id,
      kind: rail.kind === "ldo" ? "ldo" : "buck",
      title: rail.name,
      voltageLabel: fmtV(rail.voltage),
      rmsLabel: fmtA(rail.out[scenario].iRmsA),
      efficiencyLabel: rail.kind === "buck" ? pct(rail.efficiencyPct) : pct(ldoEta),
      thermalLabel,
      status: shutdownHere || droopHere ? "fault" : "ok",
      tool: toolForRail(rail),
      column: rail.depth + 1,
      sort: rail.depth * 100 + rail.name.charCodeAt(0)
    });
    if (parent?.kind === "source") links.push({ source: protectionId(parent.id), target: rail.id });
    else if (parent) links.push({ source: parent.id, target: rail.id });
  }

  const loadColumn = draft.reduce((max, node) => Math.max(max, node.column), 0) + 1;
  project.loads.forEach((load, index) => {
    const rail = rails.find((item) => item.id === load.railId);
    const railNode = draft.find((node) => node.id === load.railId);
    const namedTrip = trippedChannels.some((row) => row.channel.name.toLowerCase() === load.name.toLowerCase());
    const inherited = railNode?.status === "fault";
    draft.push({
      id: `load:${load.id}`,
      kind: "load",
      title: load.name,
      voltageLabel: fmtV(rail?.voltage ?? Number.NaN),
      rmsLabel: fmtA(loadRmsA(load, scenario)),
      efficiencyLabel: "—",
      thermalLabel: namedTrip ? "TSD" : inherited ? "Rail fault" : modeIncluded(load.mode, scenario) ? "In case" : "Off",
      status: namedTrip || inherited ? "fault" : "ok",
      tool: toolForLoad(load.name),
      column: loadColumn,
      sort: index
    });
    if (rail) links.push({ source: rail.id, target: `load:${load.id}` });
  });

  const rowsByColumn = new Map<number, number>();
  const ordered = [...draft].sort((a, b) => a.column - b.column || a.sort - b.sort || a.title.localeCompare(b.title));
  const nodes: TopologyNode[] = ordered.map((node) => {
    const row = rowsByColumn.get(node.column) ?? 0;
    rowsByColumn.set(node.column, row + 1);
    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      voltageLabel: node.voltageLabel,
      rmsLabel: node.rmsLabel,
      efficiencyLabel: node.efficiencyLabel,
      thermalLabel: node.thermalLabel,
      status: node.status,
      tool: node.tool,
      toolLabel: studioToolLabel(node.tool),
      column: node.column,
      row
    };
  });
  const statusOf = new Map(nodes.map((node) => [node.id, node.status]));
  const edges: TopologyEdge[] = links.map((link) => ({
    id: `${link.source}->${link.target}`,
    source: link.source,
    target: link.target,
    fault: statusOf.get(link.source) === "fault" || statusOf.get(link.target) === "fault"
  }));
  return { nodes, edges };
}
