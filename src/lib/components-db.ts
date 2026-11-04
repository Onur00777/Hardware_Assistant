/**
 * Deterministic automotive power-IC library.
 *
 * Numbers are typical values from the vendor electrical-characteristics table
 * unless a field is named `max`. θJA is the datasheet figure for the stated
 * package on the vendor's thermal-test board, not a bare copper pour.
 * High-side KILIS is I_load / I_sense. RDS(on) at 150 °C is the hot typical,
 * used by the harness thermal model; it is not a guaranteed maximum.
 */

export type PartCategory = "buck" | "ldo" | "high-side" | "efuse" | "ideal-diode";

interface PartBase {
  id: string;
  mpn: string;
  vendor: string;
  category: PartCategory;
  package: string;
  /** Datasheet junction-to-ambient on the vendor thermal board, °C/W. */
  thetaJa: number;
  /** Thermal-shutdown threshold, °C. */
  tsdC: number;
  notes: string;
}

export interface BuckPart extends PartBase {
  category: "buck";
  synchronous: boolean;
  vinMin: number;
  vinMax: number;
  ioutMax: number;
  /** High-side MOSFET on-resistance, ohms. */
  rdsHsOhm: number;
  /** Low-side MOSFET on-resistance, ohms. Zero when the catch element is a diode. */
  rdsLsOhm: number;
  /** External catch-diode forward drop used when synchronous is false, volts. */
  diodeVf: number;
  /** No-load operating quiescent current, amperes. */
  iqA: number;
  fswTypHz: number;
  fswMinHz: number;
  fswMaxHz: number;
  vref: number;
  /** Typical high-side current limit, amperes. */
  iLimitA: number;
}

export interface LdoPart extends PartBase {
  category: "ldo";
  vout: number;
  vinMin: number;
  vinMax: number;
  ioutMax: number;
  /** Typical dropout at ioutMax, volts. */
  vdoTyp: number;
  /** Datasheet maximum dropout at the rated current, volts. */
  vdoMax: number;
  /** Ground-pin current, amperes. */
  iqA: number;
  /** True when the pass dropout is large enough to dominate a 5 V to 3.3 V budget. */
  dropoutDanger: boolean;
  accuracyPct: number;
}

export interface HighSidePart extends PartBase {
  category: "high-side";
  channels: number;
  vinMin: number;
  vinMax: number;
  /** RDS(on) per channel at 25 °C, ohms. */
  rds25Ohm: number;
  /** RDS(on) per channel at 150 °C, ohms. */
  rds150Ohm: number;
  kilisTyp: number;
  kilisMin: number;
  kilisMax: number;
  /** Typical current-limit / short-circuit clamp per channel, amperes. */
  iLimitA: number;
  /** Restart hysteresis below tsdC, °C. */
  tsdHystC: number;
}

export interface EfusePart extends PartBase {
  category: "efuse";
  vinMin: number;
  vinMax: number;
  rdsOhm: number;
  iLimitMaxA: number;
  iqA: number;
}

export interface IdealDiodePart extends PartBase {
  category: "ideal-diode";
  vinMin: number;
  vinMax: number;
  /** Most negative input the controller is rated to survive, volts. */
  reverseSurviveV: number;
  iqA: number;
  /** Charge-pump enhancement above the source, volts. */
  gateDriveV: number;
  /**
   * External N-MOSFET the loss model uses until the user picks one.
   * 4.5 mΩ is a 40 V automotive logic-level class, not a resistance inside the controller.
   */
  defaultFetRdsOhm: number;
  defaultFetNote: string;
}

export type CatalogPart = BuckPart | LdoPart | HighSidePart | EfusePart | IdealDiodePart;

const bucks: BuckPart[] = [
  {
    id: "LM5164",
    mpn: "LM5164",
    vendor: "Texas Instruments",
    category: "buck",
    synchronous: true,
    vinMin: 6,
    vinMax: 100,
    ioutMax: 1,
    rdsHsOhm: 0.725,
    rdsLsOhm: 0.33,
    diodeVf: 0,
    iqA: 10.5e-6,
    fswTypHz: 400e3,
    fswMinHz: 100e3,
    fswMaxHz: 1e6,
    vref: 1.2,
    iLimitA: 1.5,
    tsdC: 168,
    thetaJa: 42.7,
    package: "SOIC-8 PowerPAD (DDA)",
    notes: "100 V, 1 A synchronous COT buck. RDS(on) is the 25 °C typical. θJA is the DDA JEDEC figure."
  },
  {
    id: "TPS54360B",
    mpn: "TPS54360B",
    vendor: "Texas Instruments",
    category: "buck",
    synchronous: false,
    vinMin: 4.5,
    vinMax: 60,
    ioutMax: 3.5,
    rdsHsOhm: 0.092,
    rdsLsOhm: 0,
    diodeVf: 0.5,
    iqA: 146e-6,
    fswTypHz: 500e3,
    fswMinHz: 100e3,
    fswMaxHz: 2.5e6,
    vref: 0.8,
    iLimitA: 5.5,
    tsdC: 176,
    thetaJa: 42,
    package: "HSOIC-8 PowerPAD",
    notes: "60 V, 3.5 A non-synchronous buck. The 0.50 V diode is an external Schottky assumption (B560 class), not an internal FET."
  },
  {
    id: "LMR36520",
    mpn: "LMR36520",
    vendor: "Texas Instruments",
    category: "buck",
    synchronous: true,
    vinMin: 4.2,
    vinMax: 65,
    ioutMax: 2,
    rdsHsOhm: 0.23,
    rdsLsOhm: 0.15,
    diodeVf: 0,
    iqA: 26e-6,
    fswTypHz: 400e3,
    fswMinHz: 400e3,
    fswMaxHz: 400e3,
    vref: 1,
    iLimitA: 3.2,
    tsdC: 170,
    thetaJa: 48,
    package: "HotRod VQFN",
    notes: "65 V, 2 A synchronous buck, fixed 400 kHz. The 2.2 MHz sweep in the magnetics tool is a design variable, not this orderable's clock."
  },
  {
    id: "MP2315",
    mpn: "MP2315",
    vendor: "Monolithic Power Systems",
    category: "buck",
    synchronous: true,
    vinMin: 4.5,
    vinMax: 24,
    ioutMax: 3,
    rdsHsOhm: 0.085,
    rdsLsOhm: 0.055,
    diodeVf: 0,
    iqA: 0.8e-3,
    fswTypHz: 500e3,
    fswMinHz: 500e3,
    fswMaxHz: 500e3,
    vref: 0.8,
    iLimitA: 4.5,
    tsdC: 160,
    thetaJa: 90,
    package: "TSOT-23-8",
    notes: "24 V, 3 A synchronous buck. Absolute input is only 24 V, so a 24 V GLV TVS that clamps at 42 V does not protect it."
  },
  {
    id: "MPQ4420",
    mpn: "MPQ4420",
    vendor: "Monolithic Power Systems",
    category: "buck",
    synchronous: true,
    vinMin: 4,
    vinMax: 36,
    ioutMax: 2,
    rdsHsOhm: 0.12,
    rdsLsOhm: 0.055,
    diodeVf: 0,
    iqA: 0.6e-3,
    fswTypHz: 410e3,
    fswMinHz: 410e3,
    fswMaxHz: 410e3,
    vref: 0.8,
    iLimitA: 3.5,
    tsdC: 170,
    thetaJa: 50,
    package: "QFN-8 3×3",
    notes: "AEC-Q100 36 V, 2 A synchronous buck at 410 kHz. SMBJ26A clamps at 42.1 V, which is above this 36 V rating."
  }
];

const ldos: LdoPart[] = [
  {
    id: "TLV75733P",
    mpn: "TLV75733P",
    vendor: "Texas Instruments",
    category: "ldo",
    vout: 3.3,
    vinMin: 1.45,
    vinMax: 5.5,
    ioutMax: 1,
    vdoTyp: 0.425,
    vdoMax: 0.7,
    iqA: 25e-6,
    dropoutDanger: false,
    accuracyPct: 1,
    tsdC: 165,
    thetaJa: 184,
    package: "SOT-23-5 (DBV)",
    notes: "1 A low-dropout 3.3 V LDO. Input must stay at or below 5.5 V. Dropout at 1 A is 425 mV typical."
  },
  {
    id: "TPS7A1633",
    mpn: "TPS7A1633",
    vendor: "Texas Instruments",
    category: "ldo",
    vout: 3.3,
    vinMin: 3,
    vinMax: 60,
    ioutMax: 0.1,
    vdoTyp: 0.265,
    vdoMax: 0.415,
    iqA: 5e-6,
    dropoutDanger: false,
    accuracyPct: 1,
    tsdC: 170,
    thetaJa: 56,
    package: "MSOP-8 PowerPAD (DGN)",
    notes: "60 V automotive-input LDO, 100 mA. Dropout at 100 mA is 265 mV typical and 415 mV maximum. A Q1 orderable exists."
  },
  {
    id: "AMS1117-3.3",
    mpn: "AMS1117-3.3",
    vendor: "Advanced Monolithic Systems",
    category: "ldo",
    vout: 3.3,
    vinMin: 4.6,
    vinMax: 15,
    ioutMax: 1,
    vdoTyp: 1.1,
    vdoMax: 1.3,
    iqA: 5e-3,
    dropoutDanger: true,
    accuracyPct: 1.5,
    tsdC: 150,
    thetaJa: 90,
    package: "SOT-223",
    notes:
      "High-dropout danger. Dropout is 1.1 V typical and 1.3 V maximum near 800 mA, and the ground pin burns about 5 mA. From 5 V at 0.8 A the pass element dissipates (5−3.3)×0.8 = 1.36 W before quiescent, about 122 °C rise on a light SOT-223 pour (θJA 90 °C/W). From 12 V the same current is 7 W and the package shuts down. Not an automotive part, and 15 V is the absolute input ceiling."
  }
];

const highSide: HighSidePart[] = [
  {
    id: "VNQ7050AJ",
    mpn: "VNQ7050AJ",
    vendor: "STMicroelectronics",
    category: "high-side",
    channels: 4,
    vinMin: 4,
    vinMax: 28,
    rds25Ohm: 0.05,
    rds150Ohm: 0.1,
    kilisTyp: 1460,
    kilisMin: 1040,
    kilisMax: 2000,
    iLimitA: 19,
    tsdC: 175,
    tsdHystC: 7,
    thetaJa: 40,
    package: "PowerSSO-16",
    notes: "Quad 50 mΩ VIPower high-side for radiator fan, pump, brake lamp, and RTDS. KILIS typical 1460. 28 V max is tight on a 32 V 24 V-system jump."
  },
  {
    id: "BTS7008-2EPA",
    mpn: "BTS7008-2EPA",
    vendor: "Infineon",
    category: "high-side",
    channels: 2,
    vinMin: 3.1,
    vinMax: 28,
    rds25Ohm: 0.0088,
    rds150Ohm: 0.016,
    kilisTyp: 5450,
    kilisMin: 3900,
    kilisMax: 7600,
    iLimitA: 55,
    tsdC: 175,
    tsdHystC: 10,
    thetaJa: 32,
    package: "PG-TSDSO-14",
    notes: "PROFET+2 dual channel, 8.8 mΩ at 25 °C and 16 mΩ at 150 °C. KILIS typical 5450. Same 28 V ceiling as the VNQ7050AJ."
  },
  {
    id: "BTS50085",
    mpn: "BTS50085",
    vendor: "Infineon",
    category: "high-side",
    channels: 1,
    vinMin: 5,
    vinMax: 34,
    rds25Ohm: 0.009,
    rds150Ohm: 0.016,
    kilisTyp: 10000,
    kilisMin: 7000,
    kilisMax: 14000,
    iLimitA: 75,
    tsdC: 150,
    tsdHystC: 10,
    thetaJa: 35,
    package: "TO-263",
    notes: "Single high-current classic PROFET. RDS(on) 9 mΩ typical at 25 °C, 16 mΩ at 150 °C. Thermal shutdown is 150 °C. KILIS typical 10000."
  }
];

const efuses: EfusePart[] = [
  {
    id: "TPS25940",
    mpn: "TPS25940",
    vendor: "Texas Instruments",
    category: "efuse",
    vinMin: 2.7,
    vinMax: 18,
    rdsOhm: 0.042,
    iLimitMaxA: 5.2,
    iqA: 200e-6,
    tsdC: 150,
    thetaJa: 34,
    package: "WQFN",
    notes: "2.7–18 V, 42 mΩ integrated eFuse, current limit programmable up to 5.2 A. The 18 V ceiling excludes a raw 24 V GLV feed."
  }
];

const idealDiodes: IdealDiodePart[] = [
  {
    id: "LM74700-Q1",
    mpn: "LM74700-Q1",
    vendor: "Texas Instruments",
    category: "ideal-diode",
    vinMin: 3.2,
    vinMax: 65,
    reverseSurviveV: -65,
    iqA: 35e-6,
    gateDriveV: 13,
    defaultFetRdsOhm: 0.0045,
    defaultFetNote: "External 40 V logic-level N-MOSFET at 4.5 mΩ. The controller contributes only its quiescent current.",
    tsdC: 150,
    thetaJa: 180,
    package: "SOT-23-6",
    notes: "AEC-Q100 ideal-diode controller. Operating range 3.2 V to 65 V, reverse survival to −65 V. Loss is I²·RDS of the external MOSFET plus Iq·Vin."
  }
];

export const BUCKS = bucks;
export const LDOS = ldos;
export const HIGH_SIDE = highSide;
export const EFUSES = efuses;
export const IDEAL_DIODES = idealDiodes;

export const CATALOG: CatalogPart[] = [...bucks, ...ldos, ...highSide, ...efuses, ...idealDiodes];

export function partById(id: string): CatalogPart | undefined {
  return CATALOG.find((part) => part.id === id);
}

export function bucksById(id: string): BuckPart | undefined {
  return bucks.find((part) => part.id === id);
}

export function ldosById(id: string): LdoPart | undefined {
  return ldos.find((part) => part.id === id);
}

export function highSideById(id: string): HighSidePart | undefined {
  return highSide.find((part) => part.id === id);
}

/** Hot RDS(on) by linear interpolation between the 25 °C and 150 °C datasheet typicals. */
export function rdsAtTemperature(part: HighSidePart, tjC: number): number {
  const span = 150 - 25;
  const fraction = (tjC - 25) / span;
  return part.rds25Ohm + (part.rds150Ohm - part.rds25Ohm) * fraction;
}

/**
 * Pass-element loss of an LDO at a given load, including the ground-pin current
 * drawn from Vin. Dropout uses the typical curve scaled linearly up to vdoTyp
 * at ioutMax (these LDOs are ohmic across the rated current).
 */
export function ldoDissipation(part: LdoPart, vin: number, iout: number): {
  valid: boolean;
  vdo: number;
  pPass: number;
  pIq: number;
  pTotal: number;
  dropoutDanger: boolean;
} {
  const vdo = part.ioutMax > 0 ? part.vdoTyp * (iout / part.ioutMax) : part.vdoTyp;
  const headroom = vin - part.vout;
  const valid = vin <= part.vinMax + 1e-9 && vin + 1e-9 >= part.vout + vdo && iout <= part.ioutMax + 1e-9;
  const pPass = Math.max(0, headroom) * iout;
  const pIq = vin * part.iqA;
  return {
    valid,
    vdo,
    pPass,
    pIq,
    pTotal: pPass + pIq,
    dropoutDanger: part.dropoutDanger || headroom < part.vdoMax
  };
}
