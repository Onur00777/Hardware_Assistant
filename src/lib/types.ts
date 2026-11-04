export type LoadMode = "idle" | "active" | "burst";
export type RailKind = "source" | "buck" | "ldo";
export type PackageId = "SOT-23" | "SOT-223" | "SOIC-8" | "DPAK" | "QFN";
export type RegulatorArch = "ldo" | "buck";
export type Termination = "standard" | "split";
export type CanMcu = "fdcan" | "bxcan";
export type CanBaud = 125000 | 250000 | 500000 | 1000000;

export interface Rail {
  id: string;
  name: string;
  /** Regulated or source voltage, volts. */
  voltage: number;
  parentId: string | null;
  kind: RailKind;
  /** Power-stage efficiency in percent, excluding quiescent current. Buck only. */
  efficiencyPct: number;
  /** Quiescent current drawn from the parent rail, milliamps. */
  iqMa: number;
}

export interface Load {
  id: string;
  name: string;
  railId: string;
  mode: LoadMode;
  /** Current while the mode is on, milliamps. */
  currentMa: number;
  /** Fraction of time the stated current is drawn, percent. */
  dutyPct: number;
}

export interface RegulatorInput {
  architecture: RegulatorArch;
  vin: number;
  vout: number;
  /** Load current, amperes. */
  iout: number;
  iqMa: number;
  /** Ambient temperature at the package, °C. */
  ta: number;
  packageId: PackageId;
  /** Datasheet θJA override, °C/W. Null uses the package typical. */
  rthOverride: number | null;
  fswKhz: number;
  rdsHsMo: number;
  rdsLsMo: number;
  trNs: number;
  tfNs: number;
  /** Sum of both dead-time intervals per switching cycle, nanoseconds. */
  tDeadNs: number;
  /** Low-side body-diode forward drop during dead time, volts. */
  vsd: number;
  dcrMo: number;
  qgNc: number;
  vdrive: number;
}

export interface CapacitanceInput {
  /** Nominal rail voltage, volts. */
  vNom: number;
  /** Allowed sag, millivolts. */
  dropMv: number;
  /** Load-step amplitude, amperes. */
  iPeak: number;
  /** Burst length, microseconds. */
  burstUs: number;
  /** Time for the regulator current to slew across the step, microseconds. */
  responseUs: number;
  /** Share of the droop budget assigned to ESR. The rest is capacitive. */
  esrFraction: number;
  /** Fraction of nameplate MLCC capacitance left under DC bias. */
  mlccRetention: number;
}

export interface CanInput {
  baud: CanBaud;
  termination: Termination;
  /** Split-termination midpoint capacitor, nanofarads. */
  splitCapNf: number;
  clockMhz: number;
  /** Target sample point, percent of the bit. */
  samplePointPct: number;
  mcu: CanMcu;
  busLengthM: number;
  stubLengthM: number;
  /** One-way transceiver propagation delay, nanoseconds. */
  trxDelayNs: number;
}

export interface Project {
  name: string;
  /** Allowed external-trace temperature rise used for IPC-2152 sizing, °C. */
  traceRiseC: number;
  rails: Rail[];
  loads: Load[];
  regulator: RegulatorInput;
  capacitance: CapacitanceInput;
  can: CanInput;
}
