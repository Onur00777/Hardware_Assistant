"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { analyzeCan, type CanResult } from "@/lib/engineering/can";
import { analyzePcb, type PcbResult } from "@/lib/engineering/pcb";
import { analyzeCapacitance, type CapacitanceResult } from "@/lib/engineering/capacitance";
import { analyzeHarness, type HarnessResult } from "@/lib/engineering/harness";
import { analyzePower, parentChoices, type PowerResult } from "@/lib/engineering/power";
import { analyzeProtection, type ProtectionResult } from "@/lib/engineering/protection";
import { analyzeRegulator, type RegulatorResult } from "@/lib/engineering/regulator";
import { createProject } from "@/lib/preset";
import type { CanInput, CapacitanceInput, HarnessChannel, HarnessInput, Load, MagneticsInput, PcbInput, Project, ProtectionInput, Rail, RegulatorInput } from "@/lib/types";

interface WorkbenchValue {
  project: Project;
  dirty: boolean;
  power: PowerResult;
  regulator: RegulatorResult;
  capacitance: CapacitanceResult;
  can: CanResult;
  protection: ProtectionResult;
  harness: HarnessResult;
  pcb: PcbResult;
  reset: () => void;
  setTraceRise: (value: number) => void;
  updateRail: (id: string, patch: Partial<Rail>) => void;
  updateLoad: (id: string, patch: Partial<Load>) => void;
  addRail: () => void;
  addLoad: () => string | null;
  deleteRail: (id: string) => boolean;
  deleteLoad: (id: string) => void;
  setRegulator: (patch: Partial<RegulatorInput>) => void;
  setMagnetics: (patch: Partial<MagneticsInput>) => void;
  setProtection: (patch: Partial<ProtectionInput>) => void;
  setHarness: (patch: Partial<HarnessInput>) => void;
  updateHarnessChannel: (id: string, patch: Partial<HarnessChannel>) => void;
  setPcb: (patch: Partial<PcbInput>) => void;
  setCapacitance: (patch: Partial<CapacitanceInput>) => void;
  setCan: (patch: Partial<CanInput>) => void;
}

const WorkbenchContext = createContext<WorkbenchValue | null>(null);

export function WorkbenchProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(() => createProject());
  const [dirty, setDirty] = useState(false);

  const edit = (recipe: (current: Project) => Project) => {
    setProject((current) => recipe(current));
    setDirty(true);
  };

  const power = useMemo(
    () => analyzePower(project.rails, project.loads, project.traceRiseC),
    [project.rails, project.loads, project.traceRiseC]
  );
  const regulator = useMemo(() => analyzeRegulator(project.regulator), [project.regulator]);
  const capacitance = useMemo(() => analyzeCapacitance(project.capacitance), [project.capacitance]);
  const can = useMemo(() => analyzeCan(project.can), [project.can]);
  const protection = useMemo(() => analyzeProtection(project.protection), [project.protection]);
  const harness = useMemo(() => analyzeHarness(project.harness), [project.harness]);
  const pcb = useMemo(() => analyzePcb(project.pcb), [project.pcb]);

  const value: WorkbenchValue = {
    project,
    dirty,
    power,
    regulator,
    capacitance,
    can,
    protection,
    harness,
    pcb,
    reset: () => {
      setProject(createProject());
      setDirty(false);
    },
    setTraceRise: (traceRiseC) => edit((current) => ({ ...current, traceRiseC })),
    updateRail: (id, patch) =>
      edit((current) => ({
        ...current,
        rails: current.rails.map((rail) => {
          if (rail.id !== id) return rail;
          if (rail.kind === "source" && (patch.kind || patch.parentId)) return rail;
          if (patch.parentId && !parentChoices(current.rails, id).some((choice) => choice.id === patch.parentId)) {
            return rail;
          }
          return { ...rail, ...patch, id: rail.id };
        })
      })),
    updateLoad: (id, patch) =>
      edit((current) => ({
        ...current,
        loads: current.loads.map((load) => (load.id === id ? { ...load, ...patch, id: load.id } : load))
      })),
    addRail: () =>
      edit((current) => {
        if (current.rails.length >= 12) return current;
        const source = current.rails.find((rail) => rail.kind === "source") ?? current.rails[0];
        const rail: Rail = {
          id: `rail-${crypto.randomUUID()}`,
          name: "New buck",
          voltage: 12,
          parentId: source?.id ?? null,
          kind: "buck",
          efficiencyPct: 90,
          iqMa: 0.2
        };
        return { ...current, rails: [...current.rails, rail] };
      }),
    addLoad: () => {
      if (project.loads.length >= 40) return null;
      const id = `load-${crypto.randomUUID()}`;
      edit((current) => {
        const rail = current.rails.find((item) => item.kind !== "source") ?? current.rails[0];
        const load: Load = {
          id,
          name: "New load",
          railId: rail?.id ?? "",
          mode: "active",
          currentMa: 10,
          dutyPct: 100
        };
        return { ...current, loads: [...current.loads, load] };
      });
      return id;
    },
    deleteRail: (id) => {
      const rail = project.rails.find((item) => item.id === id);
      if (!rail || rail.kind === "source") return false;
      if (project.rails.some((item) => item.parentId === id)) return false;
      edit((current) => ({
        ...current,
        rails: current.rails.filter((item) => item.id !== id),
        loads: current.loads.map((load) =>
          load.railId === id ? { ...load, railId: rail.parentId ?? load.railId } : load
        )
      }));
      return true;
    },
    deleteLoad: (id) => edit((current) => ({ ...current, loads: current.loads.filter((load) => load.id !== id) })),
    setRegulator: (patch) => edit((current) => ({ ...current, regulator: { ...current.regulator, ...patch } })),
    setMagnetics: (patch) => edit((current) => ({ ...current, magnetics: { ...current.magnetics, ...patch } })),
    setProtection: (patch) => edit((current) => ({ ...current, protection: { ...current.protection, ...patch } })),
    setHarness: (patch) => edit((current) => ({ ...current, harness: { ...current.harness, ...patch } })),
    updateHarnessChannel: (id, patch) =>
      edit((current) => ({
        ...current,
        harness: {
          ...current.harness,
          channels: current.harness.channels.map((channel) => (channel.id === id ? { ...channel, ...patch, id: channel.id } : channel))
        }
      })),
    setPcb: (patch) => edit((current) => ({ ...current, pcb: { ...current.pcb, ...patch } })),
    setCapacitance: (patch) => edit((current) => ({ ...current, capacitance: { ...current.capacitance, ...patch } })),
    setCan: (patch) => edit((current) => ({ ...current, can: { ...current.can, ...patch } }))
  };

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchValue {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("useWorkbench must be used within WorkbenchProvider");
  return value;
}
