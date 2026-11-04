"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  Handle,
  Position,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { useMemo } from "react";
import { buildPowerTopology, type TopologyNode } from "@/lib/power-topology";
import type { StudioToolId } from "@/lib/studio-nav";
import type { Scenario } from "@/lib/engineering/power";
import type { CapacitanceResult } from "@/lib/engineering/capacitance";
import type { HarnessResult } from "@/lib/engineering/harness";
import type { PowerResult } from "@/lib/engineering/power";
import type { ProtectionResult } from "@/lib/engineering/protection";
import type { RegulatorResult } from "@/lib/engineering/regulator";
import type { Project } from "@/lib/types";
import { cn } from "@/components/ui";

export interface PowerNodeData extends Record<string, unknown> {
  title: string;
  kindLabel: string;
  voltageLabel: string;
  rmsLabel: string;
  efficiencyLabel: string;
  thermalLabel: string;
  status: TopologyNode["status"];
  tool: StudioToolId;
  toolLabel: string;
}

type StageNode = Node<PowerNodeData, "stage">;

const KIND_LABEL: Record<TopologyNode["kind"], string> = {
  feed: "24 V feed",
  protection: "Input guard",
  buck: "Buck",
  ldo: "LDO",
  load: "Load"
};

function StageNodeView({ data }: NodeProps<StageNode>) {
  const fault = data.status === "fault";
  return (
    <div
      className={cn(
        "w-[232px] cursor-pointer rounded-xl border bg-[#0c1118] px-3 py-2.5 text-left shadow-lg",
        fault ? "power-node-fault border-red-400/80" : "border-emerald-400/45"
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-500" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{data.kindLabel}</span>
        <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", fault ? "text-red-300" : "text-emerald-300")}>
          {fault ? "Fault" : "Healthy"}
        </span>
      </div>
      <div className="mt-1 truncate text-sm text-slate-100">{data.title}</div>
      <div className={cn("mt-1 font-mono text-2xl tabular-nums", fault ? "text-red-300" : "text-emerald-300")}>{data.voltageLabel}</div>
      <dl className="mt-2 space-y-0.5 font-mono text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">RMS</dt>
          <dd className="text-slate-200">{data.rmsLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Efficiency</dt>
          <dd className="text-slate-200">{data.efficiencyLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Thermal</dt>
          <dd className={fault ? "text-red-200" : "text-slate-200"}>{data.thermalLabel}</dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-200/80">Open {data.toolLabel}</p>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-500" />
    </div>
  );
}

const nodeTypes = { stage: StageNodeView };

export function PowerTreeCanvas({
  project,
  power,
  protection,
  regulator,
  capacitance,
  harness,
  scenario,
  onOpen
}: {
  project: Project;
  power: PowerResult;
  protection: ProtectionResult;
  regulator: RegulatorResult;
  capacitance: CapacitanceResult;
  harness: HarnessResult;
  scenario: Scenario;
  onOpen: (tool: StudioToolId) => void;
}) {
  const topology = useMemo(
    () => buildPowerTopology({ project, power, protection, regulator, capacitance, harness, scenario }),
    [project, power, protection, regulator, capacitance, harness, scenario]
  );
  const structureKey = topology.nodes.map((node) => node.id).join("|");
  const nodes = useMemo<StageNode[]>(
    () =>
      topology.nodes.map((node) => ({
        id: node.id,
        type: "stage",
        position: { x: node.column * 300, y: node.row * 176 },
        dragHandle: ".no-drag",
        draggable: false,
        connectable: false,
        data: {
          title: node.title,
          kindLabel: KIND_LABEL[node.kind],
          voltageLabel: node.voltageLabel,
          rmsLabel: node.rmsLabel,
          efficiencyLabel: node.efficiencyLabel,
          thermalLabel: node.thermalLabel,
          status: node.status,
          tool: node.tool,
          toolLabel: node.toolLabel
        }
      })),
    [topology]
  );
  const edges = useMemo(
    () =>
      topology.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: true,
        className: edge.fault ? "power-edge-fault" : "power-edge-ok",
        style: { stroke: edge.fault ? "#f87171" : "#34d399", strokeWidth: edge.fault ? 2.2 : 1.6 }
      })),
    [topology]
  );

  return (
    <div className="power-flow h-[680px] overflow-hidden rounded-xl border border-white/[0.08] bg-black/25">
      <ReactFlow
        key={structureKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.5}
        colorMode="dark"
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_, node) => onOpen(node.data.tool)}
      >
        <Background gap={28} color="rgba(255,255,255,0.04)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(0,0,0,0.55)"
          nodeColor={(node) => (node.data.status === "fault" ? "#f87171" : "#34d399")}
        />
      </ReactFlow>
    </div>
  );
}
