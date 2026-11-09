"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { analyzeCan, type CanResult } from "@/lib/engineering/can";
import { analyzeAnalog, type AnalogResult } from "@/lib/engineering/analog";
import { analyzePcb, type PcbResult } from "@/lib/engineering/pcb";
import { analyzeCapacitance, type CapacitanceResult } from "@/lib/engineering/capacitance";
import { analyzeHarness, type HarnessResult } from "@/lib/engineering/harness";
import { analyzePower, parentChoices, type PowerResult } from "@/lib/engineering/power";
import { analyzeProtection, type ProtectionResult } from "@/lib/engineering/protection";
import { analyzeRegulator, type RegulatorResult } from "@/lib/engineering/regulator";
import { asProject } from "@/lib/altium-script";
import { createBoard, createEmptyProject, type BoardPresetId } from "@/lib/preset";
import type { StudioToolId } from "@/lib/studio-nav";
import type { AnalogInput, CanInput, CapacitanceInput, HarnessChannel, HarnessInput, Load, MagneticsInput, PcbInput, Project, ProtectionInput, Rail, RegulatorInput } from "@/lib/types";

export interface CustomProjectEntry {
  id: string;
  name: string;
  updatedAt: string;
  project: Project;
}

const STORAGE_KEY = "hwps_custom_workspaces_v1";

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
  analog: AnalogResult;
  presetId: BoardPresetId | "custom";
  activeCustomId: string | null;
  customProjects: CustomProjectEntry[];
  tool: StudioToolId;
  openTool: (tool: StudioToolId) => void;
  loadPreset: (id: BoardPresetId) => void;
  loadCustomProject: (id: string) => void;
  saveCurrentAsCustom: (name?: string) => void;
  deleteCustomProject: (id: string) => void;
  createNewWorkspace: (name?: string) => void;
  exportProjectJson: () => void;
  importProjectJson: (json: string) => boolean;
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
  setAnalog: (patch: Partial<AnalogInput>) => void;
  setCapacitance: (patch: Partial<CapacitanceInput>) => void;
  setCan: (patch: Partial<CanInput>) => void;
}

const WorkbenchContext = createContext<WorkbenchValue | null>(null);

export function WorkbenchProvider({ children }: { children: React.ReactNode }) {
  const [presetId, setPresetId] = useState<BoardPresetId | "custom">("tl27");
  const [activeCustomId, setActiveCustomId] = useState<string | null>(null);
  const [customProjects, setCustomProjects] = useState<CustomProjectEntry[]>([]);
  const [tool, setTool] = useState<StudioToolId>("power");
  const [project, setProject] = useState<Project>(() => createBoard("tl27"));
  const [dirty, setDirty] = useState(false);

  // Load custom workspaces from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCustomProjects(parsed);
        }
      }
    } catch {
      // Ignore localStorage read errors in SSR or restricted iframe
    }
  }, []);

  const saveToStorage = (updated: CustomProjectEntry[]) => {
    setCustomProjects(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore write errors
    }
  };

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
  const analog = useMemo(() => analyzeAnalog(project.analog), [project.analog]);

  const value: WorkbenchValue = {
    project,
    dirty,
    presetId,
    activeCustomId,
    customProjects,
    tool,
    openTool: setTool,
    power,
    regulator,
    capacitance,
    can,
    protection,
    harness,
    pcb,
    analog,
    loadPreset: (id) => {
      setPresetId(id);
      setActiveCustomId(null);
      setProject(createBoard(id));
      setDirty(false);
    },
    loadCustomProject: (id) => {
      const match = customProjects.find((entry) => entry.id === id);
      if (!match) return;
      setPresetId("custom");
      setActiveCustomId(id);
      setProject(structuredClone(match.project));
      setDirty(false);
    },
    saveCurrentAsCustom: (name) => {
      const projName = name?.trim() || project.name || "Özel Proje";
      const now = new Date().toLocaleString("tr-TR");
      const id = activeCustomId || `workspace-${Date.now()}`;
      const updatedProject = { ...project, name: projName };
      const entry: CustomProjectEntry = {
        id,
        name: projName,
        updatedAt: now,
        project: updatedProject
      };
      const filtered = customProjects.filter((p) => p.id !== id);
      const updated = [entry, ...filtered];
      saveToStorage(updated);
      setProject(updatedProject);
      setPresetId("custom");
      setActiveCustomId(id);
      setDirty(false);
    },
    deleteCustomProject: (id) => {
      const updated = customProjects.filter((p) => p.id !== id);
      saveToStorage(updated);
      if (activeCustomId === id) {
        setPresetId("tl27");
        setActiveCustomId(null);
        setProject(createBoard("tl27"));
        setDirty(false);
      }
    },
    createNewWorkspace: (name = "Yeni Donanım Projesi") => {
      const newProj = createEmptyProject(name);
      const id = `workspace-${Date.now()}`;
      const entry: CustomProjectEntry = {
        id,
        name,
        updatedAt: new Date().toLocaleString("tr-TR"),
        project: newProj
      };
      saveToStorage([entry, ...customProjects]);
      setProject(newProj);
      setPresetId("custom");
      setActiveCustomId(id);
      setDirty(false);
    },
    exportProjectJson: () => {
      const json = JSON.stringify(project, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-project.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    importProjectJson: (jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        const validated = asProject(parsed);
        if (!validated) return false;
        const id = `workspace-${Date.now()}`;
        const entry: CustomProjectEntry = {
          id,
          name: validated.name || "İçe Aktarılan Proje",
          updatedAt: new Date().toLocaleString("tr-TR"),
          project: validated
        };
        saveToStorage([entry, ...customProjects]);
        setProject(validated);
        setPresetId("custom");
        setActiveCustomId(id);
        setDirty(false);
        return true;
      } catch {
        return false;
      }
    },
    reset: () => {
      if (presetId !== "custom") {
        setProject(createBoard(presetId));
      } else if (activeCustomId) {
        const match = customProjects.find((p) => p.id === activeCustomId);
        if (match) setProject(structuredClone(match.project));
      }
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
          name: "Yeni Buck",
          voltage: 5,
          parentId: source?.id ?? null,
          kind: "buck",
          efficiencyPct: 90,
          iqMa: 0.1
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
          name: "Yeni Yük",
          railId: rail?.id ?? "",
          mode: "active",
          currentMa: 20,
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
    setAnalog: (patch) => edit((current) => ({ ...current, analog: { ...current.analog, ...patch } })),
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
