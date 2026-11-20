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
  label: string;
  before: string;
  after: string;
}

const SECTIONS: Record<string, string> = {
  name: "Proje", traceRiseC: "Güç ağacı", rails: "Güç rayları", loads: "Yükler", regulator: "Regülatör",
  magnetics: "Bobin ve MLCC", protection: "Koruma", harness: "Kablo ve sürücüler", pcb: "PCB",
  analog: "Analog", capacitance: "Bulk kapasite", can: "CAN bus"
};

const FIELDS: Record<string, string> = {
  name: "Ad", traceRiseC: "İzin verilen iz sıcaklık artışı (°C)", id: "Kimlik", kind: "Tür", parentId: "Üst ray",
  voltage: "Gerilim (V)", efficiencyPct: "Verim (%)", iqMa: "Boşta tüketim (mA)", railId: "Besleme rayı",
  mode: "Çalışma modu", currentMa: "Yük akımı (mA)", dutyPct: "Görev oranı (%)", architecture: "Mimari",
  vin: "Giriş gerilimi (V)", vout: "Çıkış gerilimi (V)", iout: "Çıkış akımı (A)", ta: "Ortam sıcaklığı (°C)",
  packageId: "Paket", rthOverride: "Isıl direnç (°C/W)", fswKhz: "Anahtarlama frekansı (kHz)",
  rdsHsMo: "Üst MOSFET RDS(on) (mΩ)", rdsLsMo: "Alt MOSFET RDS(on) (mΩ)", trNs: "Yükselme süresi (ns)",
  tfNs: "Düşme süresi (ns)", tDeadNs: "Ölü zaman (ns)", vsd: "Diyot gerilimi (V)", dcrMo: "Bobin DCR (mΩ)",
  qgNc: "Gate yükü (nC)", vdrive: "Gate sürme gerilimi (V)", rippleFraction: "Dalgalanma oranı", satMargin: "Doyum marjı",
  tempC: "Sıcaklık (°C)", inductorId: "Bobin", volumeCm3: "Çekirdek hacmi (cm³)", mlccCase: "MLCC boyutu",
  mlccDielectric: "MLCC dielektrik", cNomUf: "Nominal kapasite (µF)", vRated: "Anma gerilimi (V)",
  vdc: "DC bias (V)", esrMo: "ESR (mΩ)", mlccCount: "MLCC adedi", mlccTempC: "MLCC sıcaklığı (°C)",
  vNom: "Nominal gerilim (V)", dropMv: "İzin verilen gerilim düşümü (mV)", iPeak: "Tepe akımı (A)",
  burstUs: "Darbe süresi (µs)", responseUs: "Regülatör tepki süresi (µs)", esrFraction: "ESR bütçe oranı",
  mlccRetention: "MLCC etkin kapasite oranı", iRms: "RMS akım (A)", systemV: "Sistem gerilimi (V)",
  vSystemMax: "En yüksek sistem gerilimi (V)", tvsId: "TVS", buckId: "Buck", pmosRdsOhm: "PMOS RDS(on) (Ω)",
  pmosRdsHotOhm: "Sıcak PMOS RDS(on) (Ω)", lH: "Filtre bobini (H)", cF: "Filtre kapasitesi (F)",
  rlOhm: "Filtre bobini DCR (Ω)", cdF: "Sönümleme kapasitesi (F)", rdOhm: "Sönümleme direnci (Ω)",
  lCoilH: "Röle bobini (H)", iCoilA: "Röle akımı (A)", pout: "Çıkış gücü (W)", eta: "Verim oranı",
  fswHz: "Anahtarlama frekansı (Hz)", fCrossHz: "Döngü geçiş frekansı (Hz)", vRail: "Ray gerilimi (V)",
  vAdcMax: "ADC üst gerilimi (V)", switchId: "Üst taraf anahtarı", packageGroup: "Ortak paket",
  currentA: "Akım (A)", lengthM: "Kablo uzunluğu (m)", areaMm2: "Kablo kesiti (mm²)", insulation: "Yalıtım",
  fuseA: "Sigorta (A)", loadKind: "Yük türü", capacitanceF: "Yük kapasitesi (F)",
  inrushMultiple: "İlk akım çarpanı", inrushMs: "İlk akım süresi (ms)", riseC: "Sıcaklık artışı (°C)",
  oz: "Bakır ağırlığı (oz)", viaDrillMm: "Via delik çapı (mm)", stackupId: "Katman yapısı", grid: "Via dizisi",
  thermalPackage: "Isıl paket", rPlane: "Düzlem ısıl direnci (°C/W)", platingUm: "Via kaplaması (µm)",
  vinSense: "Ölçülen giriş (V)", vAdcTarget: "ADC hedefi (V)", series: "Direnç serisi", r2Ohm: "Alt direnç (Ω)",
  vref: "Referans gerilimi (V)", bits: "ADC çözünürlüğü (bit)", cAdcF: "ADC kapasitesi (F)",
  rAdcOhm: "ADC anahtar direnci (Ω)", cFiltF: "ADC filtre kapasitesi (F)", tSampleUs: "Örnekleme süresi (µs)",
  ntcR0: "NTC nominal direnci (Ω)", ntcBeta: "NTC beta (K)", ntcT0C: "NTC referans sıcaklığı (°C)",
  rFixed: "NTC sabit direnci (Ω)", useSteinhart: "Steinhart–Hart modeli", shA: "Steinhart–Hart A",
  shB: "Steinhart–Hart B", shC: "Steinhart–Hart C", baud: "Bit hızı (bit/s)", termination: "Sonlandırma",
  splitCapNf: "Split kapasite (nF)", clockMhz: "CAN saati (MHz)", samplePointPct: "Örnekleme noktası (%)",
  mcu: "CAN denetleyicisi", busLengthM: "Hat uzunluğu (m)", stubLengthM: "Dal uzunluğu (m)", trxDelayNs: "Transceiver gecikmesi (ns)"
};

function changeLabel(field: string, before: Project, after: Project): string {
  const entity = /^(rails|loads|harness\.channels)\[([^\]]+)\]\.(.+)$/.exec(field);
  const leaf = field.split(".").at(-1) ?? field;
  const label = FIELDS[leaf] ?? leaf;
  if (!entity) return label;
  const [, collection, id] = entity;
  const lists = collection === "rails" ? [after.rails, before.rails]
    : collection === "loads" ? [after.loads, before.loads] : [after.harness.channels, before.harness.channels];
  const item = lists.flat().find(row => row.id === id);
  return `${item?.name ?? id} · ${label}`;
}

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
    changes.push({ section: SECTIONS[root] ?? root, field, label: changeLabel(field, before, after), before: left.get(field) ?? "Eklenmemiş", after: right.get(field) ?? "Silinmiş" });
  }
  return changes;
}
