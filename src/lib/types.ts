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

export type MlccCase = "0402" | "0603" | "0805" | "1206";
export type MlccDielectric = "X5R" | "X7R";

export interface MagneticsInput {
  /** Fraction of Iout used as the inductor ripple target. 0.20–0.40 is the CCM window. */
  rippleFraction: number;
  /** Fractional headroom of Isat above Ipeak. */
  satMargin: number;
  /** Copper temperature for the DCR correction, °C. */
  tempC: number;
  /** "sized" uses the calculated L. Otherwise an inductor catalog id. */
  inductorId: string;
  /** DCR at 25 °C when inductorId is "sized", milliohms. */
  dcrMo: number;
  /** Core volume for iGSE when the inductor is not a catalog part, cm³. */
  volumeCm3: number;
  mlccCase: MlccCase;
  mlccDielectric: MlccDielectric;
  /** Nameplate capacitance of one MLCC, microfarads. */
  cNomUf: number;
  vRated: number;
  /** DC bias the capacitor actually sees, volts. */
  vdc: number;
  /** ESR of one MLCC, milliohms. */
  esrMo: number;
  mlccCount: number;
  mlccTempC: number;
}

export interface ProtectionInput {
  /** Mission RMS current through the reverse-polarity device, amperes. */
  iRms: number;
  /** Coincident peak current, amperes. */
  iPeak: number;
  /** Nominal GLV, volts. 12 or 24. */
  systemV: number;
  /** Maximum operating voltage the TVS must stand off, volts. */
  vSystemMax: number;
  tvsId: string;
  buckId: string;
  /** P-MOSFET RDS(on) at 25 °C, ohms. */
  pmosRdsOhm: number;
  /** P-MOSFET RDS(on) at hot junction, used for the peak-loss column, ohms. */
  pmosRdsHotOhm: number;
  /** Filter inductor, henries. */
  lH: number;
  /** Filter shunt capacitor, farads. */
  cF: number;
  /** Inductor DCR, ohms. */
  rlOhm: number;
  /** Series damper capacitor, farads. Zero opens the damper. */
  cdF: number;
  /** Series damper resistor, ohms. Zero opens the damper. */
  rdOhm: number;
  /** Contactor or relay coil inductance, henries. */
  lCoilH: number;
  /** Coil current interrupted into the TVS, amperes. */
  iCoilA: number;
  vin: number;
  /** Buck output power that sets the constant-power input impedance, watts. */
  pout: number;
  /** Buck efficiency, 0 to 1. */
  eta: number;
  fswHz: number;
  /** Voltage-loop crossover. Zero selects fsw/10. */
  fCrossHz: number;
}

export type HarnessLoadKind = "resistive" | "capacitive" | "lamp" | "fan";
export type WireInsulation = "pvc" | "xlpe";

export interface HarnessChannel {
  id: string;
  name: string;
  switchId: string;
  /** Channels that share this id share one package and one thermal slug. */
  packageGroup: string;
  currentA: number;
  lengthM: number;
  areaMm2: number;
  insulation: WireInsulation;
  fuseA: number;
  loadKind: HarnessLoadKind;
  /** Load capacitance for the capacitive inrush model, farads. */
  capacitanceF: number;
  /** Cold-lamp or stall-fan multiple of the steady current. */
  inrushMultiple: number;
  inrushMs: number;
}

export interface HarnessInput {
  ta: number;
  vRail: number;
  vAdcMax: number;
  channels: HarnessChannel[];
}

export type StackupId = "JLC04161H-7628" | "JLC04161H-3313";
export type ThermalPackageId = "QFN" | "DPAK" | "SOT-223";

export interface PcbInput {
  currentA: number;
  riseC: number;
  /** Copper weight in ounces. */
  oz: 0.5 | 1 | 2;
  viaDrillMm: number;
  /** Current the via field must carry at a 0.5 °C barrel rise. */
  iPeak: number;
  stackupId: StackupId;
  /** Thermal via grid, N of an N×N array. */
  grid: 3 | 4 | 5;
  thermalPackage: ThermalPackageId;
  /** Plane-to-ambient thermal resistance, °C/W. */
  rPlane: number;
  /** Via wall plating, micrometres. 35 is 1 oz. */
  platingUm: number;
}

export type ResistorSeries = "E24" | "E96";

export interface AnalogInput {
  /** Highest voltage the divider must accept, volts. */
  vinSense: number;
  /** ADC voltage wanted at that input, volts. */
  vAdcTarget: number;
  series: ResistorSeries;
  /** Preferred bottom resistor before it is snapped to the series, ohms. */
  r2Ohm: number;
  vref: number;
  bits: number;
  /** Sample-and-hold capacitance, farads. */
  cAdcF: number;
  /** ADC sampling-switch resistance, ohms. */
  rAdcOhm: number;
  /** External hold / anti-alias capacitor, farads. */
  cFiltF: number;
  /** Sampling window, microseconds. */
  tSampleUs: number;
  ntcR0: number;
  ntcBeta: number;
  ntcT0C: number;
  /** Pull-up above the NTC, ohms. */
  rFixed: number;
  useSteinhart: boolean;
  shA: number;
  shB: number;
  shC: number;
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
  magnetics: MagneticsInput;
  protection: ProtectionInput;
  harness: HarnessInput;
  pcb: PcbInput;
  analog: AnalogInput;
  capacitance: CapacitanceInput;
  can: CanInput;
}
