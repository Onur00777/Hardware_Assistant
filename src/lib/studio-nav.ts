export const STUDIO_TOOLS = [
  { id: "gate", label: "Design gate", detail: "Release" },
  { id: "power", label: "Power tree", detail: "Budget" },
  { id: "thermal", label: "Regulator", detail: "Thermal" },
  { id: "bulk", label: "Bulk cap", detail: "Transient" },
  { id: "protect", label: "Protection", detail: "ISO 7637" },
  { id: "harness", label: "Harness", detail: "I²t" },
  { id: "pcb", label: "PCB", detail: "Impedance" },
  { id: "analog", label: "Analog", detail: "ADC / NTC" },
  { id: "export", label: "Export", detail: "SPICE / BOM" },
  { id: "can", label: "CAN bus", detail: "Physical" }
] as const;

export type StudioToolId = (typeof STUDIO_TOOLS)[number]["id"];

export function studioToolLabel(id: StudioToolId): string {
  return STUDIO_TOOLS.find((tool) => tool.id === id)?.label ?? id;
}
