import { asProject } from "./altium-script";
import type { Project } from "./types";

export interface ProjectVersion {
  id: string;
  number: number;
  date: string;
  title: string;
  summary: string;
  createdAt: string;
  snapshot: Project | null;
}

export type VersionDraft = Pick<ProjectVersion, "number" | "date" | "title" | "summary"> & { captureSnapshot: boolean };

export interface CustomProjectEntry {
  id: string;
  name: string;
  updatedAt: string;
  project: Project;
  versions?: ProjectVersion[];
}

export interface WorkspaceStore {
  customProjects: CustomProjectEntry[];
  presetVersions: Record<string, ProjectVersion[]>;
}

export const WORKSPACE_STORAGE_KEY = "hwps_workspaces_v2";
export const LEGACY_STORAGE_KEY = "hwps_custom_workspaces_v1";

export function validVersionDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function parseVersions(value: unknown): ProjectVersion[] {
  if (!Array.isArray(value)) throw new Error("Sürüm geçmişi bir liste olmalı.");
  const numbers = new Set<number>();
  const ids = new Set<string>();
  for (const version of value) {
    if (!version || typeof version !== "object" || typeof version.id !== "string" || !version.id ||
      !Number.isSafeInteger(version.number) || version.number < 1 || typeof version.date !== "string" ||
      !validVersionDate(version.date) || typeof version.title !== "string" || !version.title.trim() ||
      typeof version.summary !== "string" || !version.summary.trim() || typeof version.createdAt !== "string" ||
      !Number.isFinite(Date.parse(version.createdAt)) ||
      (version.snapshot !== null && !asProject(version.snapshot)) || numbers.has(version.number) || ids.has(version.id)) {
      throw new Error("Sürüm geçmişinde geçersiz veya tekrarlanan bir kayıt var.");
    }
    numbers.add(version.number);
    ids.add(version.id);
  }
  return [...value].sort((a, b) => a.number - b.number);
}

export function parseWorkspaceStore(value: unknown): WorkspaceStore {
  if (!value || typeof value !== "object") throw new Error("Çalışma alanı verisi okunamadı.");
  const store = value as WorkspaceStore;
  if (!Array.isArray(store.customProjects) || !store.presetVersions || typeof store.presetVersions !== "object" || Array.isArray(store.presetVersions)) {
    throw new Error("Çalışma alanı verisi okunamadı.");
  }
  const customProjects = store.customProjects.map((entry) => {
    if (!entry || typeof entry.id !== "string" || typeof entry.name !== "string" || typeof entry.updatedAt !== "string" || !asProject(entry.project)) {
      throw new Error("Kayıtlı proje okunamadı.");
    }
    return { ...entry, versions: parseVersions(entry.versions ?? []) };
  });
  const presetVersions = Object.fromEntries(Object.entries(store.presetVersions).map(([id, versions]) => [id, parseVersions(versions)]));
  return { customProjects, presetVersions };
}

// Keep the project at the root so existing Altium API consumers can read backups.
export function parseProjectBackup(value: unknown): { project: Project; versions: ProjectVersion[] } {
  const project = asProject(value);
  if (!project) throw new Error("Geçersiz proje JSON dosyası.");
  const { versionHistory, ...snapshot } = value as Project & { versionHistory?: unknown };
  return { project: snapshot, versions: parseVersions(versionHistory ?? []) };
}

export interface VersionChange {
  section: string;
  field: string;
  before: string;
  after: string;
}

const SECTIONS: Record<string, string> = {
  name: "Proje", traceRiseC: "Güç ağacı", rails: "Güç rayları", loads: "Yükler", regulator: "Regülatör",
  magnetics: "Bobin ve MLCC", protection: "Koruma", harness: "Kablo ve sürücüler", pcb: "PCB",
  analog: "Analog", capacitance: "Bulk kapasite", can: "CAN bus"
};

function flatten(value: unknown, path: string, result: Map<string, string>) {
  if (Array.isArray(value)) {
    // Entity IDs keep insertions and reordering from becoming unrelated changes.
    for (const [index, item] of value.entries()) flatten(item, `${path}[${item?.id ?? index}]`, result);
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) flatten(item, path ? `${path}.${key}` : key, result);
  } else {
    result.set(path, value === null ? "Otomatik / boş" : String(value));
  }
}

export function compareProjects(before: Project, after: Project): VersionChange[] {
  const left = new Map<string, string>();
  const right = new Map<string, string>();
  flatten(before, "", left);
  flatten(after, "", right);
  const changes: VersionChange[] = [];
  for (const field of new Set([...left.keys(), ...right.keys()])) {
    if (left.get(field) === right.get(field)) continue;
    const root = field.split(/[.[]/)[0];
    changes.push({ section: SECTIONS[root] ?? root, field, before: left.get(field) ?? "Eklenmemiş", after: right.get(field) ?? "Silinmiş" });
  }
  return changes;
}
