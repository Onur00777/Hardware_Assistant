import type { CanBaud, CanInput, CanMcu, Termination } from "../types";

/** Twisted-pair delay used for ISO 11898-2 budgeting: 5 ns/m. */
export const CAN_VELOCITY_M_PER_S = 2e8;

export interface CanBaudLimit {
  baud: CanBaud;
  label: string;
  maxBusM: number;
  maxStubM: number;
}

/**
 * High-speed CAN bus length is the conservative ISO 11898-2 column
 * (25 m at 1 Mbit/s, doubling as the bit rate halves).
 * The 0.3 m stub is the multi-drop guideline used with that column.
 */
export const CAN_BAUD_LIMITS: CanBaudLimit[] = [
  { baud: 125000, label: "125 kbit/s", maxBusM: 500, maxStubM: 0.3 },
  { baud: 250000, label: "250 kbit/s", maxBusM: 250, maxStubM: 0.3 },
  { baud: 500000, label: "500 kbit/s", maxBusM: 100, maxStubM: 0.3 },
  { baud: 1000000, label: "1 Mbit/s", maxBusM: 25, maxStubM: 0.3 }
];

interface McuLimits {
  label: string;
  maxSeg1: number;
  maxSeg2: number;
  maxSjw: number;
  maxPrescaler: number;
}

const MCU_LIMITS: Record<CanMcu, McuLimits> = {
  fdcan: {
    label: "STM32 FDCAN (H7 HAL time quanta)",
    maxSeg1: 256,
    maxSeg2: 128,
    maxSjw: 128,
    maxPrescaler: 512
  },
  bxcan: {
    label: "STM32 bxCAN (F4)",
    maxSeg1: 16,
    maxSeg2: 8,
    maxSjw: 4,
    maxPrescaler: 1024
  }
};

export interface CanTiming {
  solvable: boolean;
  prescaler: number;
  nTq: number;
  seg1: number;
  seg2: number;
  sjw: number;
  samplePoint: number;
  actualBaud: number;
  ppm: number;
  tqNs: number;
  bitNs: number;
  sampleNs: number;
}

export interface CanBaudRow {
  limit: CanBaudLimit;
  timing: CanTiming;
  timingMaxBusM: number;
  marginNs: number;
  busOk: boolean;
  stubOk: boolean;
  timingOk: boolean;
  selected: boolean;
}

export interface TerminationResult {
  mode: Termination;
  differentialOhm: number;
  legOhm: number | null;
  capacitorF: number | null;
  cutoffHz: number | null;
  powerTypicalW: number;
  powerWorstW: number;
  powerAverageW: number;
  perResistor: boolean;
}

export interface CanResult {
  mcuLabel: string;
  timing: CanTiming;
  rows: CanBaudRow[];
  termination: TerminationResult;
  warnings: string[];
}

export function solveTiming(clockMhz: number, baud: number, samplePoint: number, mcu: CanMcu): CanTiming {
  const limits = MCU_LIMITS[mcu];
  const fClk = Math.round(clockMhz * 1e6);
  const target = Math.min(0.9, Math.max(0.5, samplePoint));
  let best: CanTiming | null = null;

  const consider = (candidate: CanTiming) => {
    if (!best) {
      best = candidate;
      return;
    }
    const ppmBetter = candidate.ppm < best.ppm - 1e-6;
    const ppmSame = Math.abs(candidate.ppm - best.ppm) <= 1e-6;
    const sampleBetter = Math.abs(candidate.samplePoint - target) < Math.abs(best.samplePoint - target) - 1e-9;
    const sampleSame = Math.abs(Math.abs(candidate.samplePoint - target) - Math.abs(best.samplePoint - target)) <= 1e-9;
    const tqBetter = Math.abs(candidate.nTq - 16) < Math.abs(best.nTq - 16);
    const tqSame = Math.abs(candidate.nTq - 16) === Math.abs(best.nTq - 16);
    const prescBetter = candidate.prescaler < best.prescaler;
    if (ppmBetter || (ppmSame && (sampleBetter || (sampleSame && (tqBetter || (tqSame && prescBetter)))))) {
      best = candidate;
    }
  };

  if (fClk > 0 && baud > 0) {
    for (let nTq = 8; nTq <= 25; nTq += 1) {
      const presc = Math.round(fClk / (nTq * baud));
      if (presc < 1 || presc > limits.maxPrescaler) continue;
      const actualBaud = fClk / (presc * nTq);
      if (!(actualBaud > 0)) continue;
      const ppm = (Math.abs(actualBaud - baud) / baud) * 1e6;
      const segSum = nTq - 1;
      for (let seg2 = 1; seg2 <= Math.min(limits.maxSeg2, segSum - 1); seg2 += 1) {
        const seg1 = segSum - seg2;
        if (seg1 < 1 || seg1 > limits.maxSeg1) continue;
        const sp = (1 + seg1) / nTq;
        const sjw = Math.min(limits.maxSjw, seg2);
        const tqNs = (presc / fClk) * 1e9;
        consider({
          solvable: true,
          prescaler: presc,
          nTq,
          seg1,
          seg2,
          sjw,
          samplePoint: sp,
          actualBaud,
          ppm,
          tqNs,
          bitNs: tqNs * nTq,
          sampleNs: tqNs * (1 + seg1)
        });
      }
    }
  }

  return (
    best ?? {
      solvable: false,
      prescaler: 0,
      nTq: 0,
      seg1: 0,
      seg2: 0,
      sjw: 0,
      samplePoint: 0,
      actualBaud: 0,
      ppm: Infinity,
      tqNs: 0,
      bitNs: 0,
      sampleNs: 0
    }
  );
}

function termination(mode: Termination, splitCapNf: number): TerminationResult {
  const vTyp = 2;
  const vMax = 3;
  if (mode === "standard") {
    const powerTypicalW = (vTyp * vTyp) / 120;
    const powerWorstW = (vMax * vMax) / 120;
    return {
      mode,
      differentialOhm: 120,
      legOhm: null,
      capacitorF: null,
      cutoffHz: null,
      powerTypicalW,
      powerWorstW,
      powerAverageW: powerTypicalW * 0.5,
      perResistor: false
    };
  }
  const capF = Math.max(0, splitCapNf) * 1e-9;
  const powerTypicalW = (vTyp / 2) ** 2 / 60;
  const powerWorstW = (vMax / 2) ** 2 / 60;
  const cutoffHz = capF > 0 ? 1 / (2 * Math.PI * 30 * capF) : null;
  return {
    mode,
    differentialOhm: 120,
    legOhm: 60,
    capacitorF: capF,
    cutoffHz,
    powerTypicalW,
    powerWorstW,
    powerAverageW: powerTypicalW * 0.5,
    perResistor: true
  };
}

function rowFor(input: CanInput, limit: CanBaudLimit): CanBaudRow {
  const timing = solveTiming(input.clockMhz, limit.baud, input.samplePointPct / 100, input.mcu);
  const trx = Math.max(0, input.trxDelayNs) * 1e-9;
  const tSample = timing.solvable ? timing.sampleNs * 1e-9 : 0;
  const timingMaxBusM = Math.max(0, (tSample / 2 - trx) * CAN_VELOCITY_M_PER_S);
  const tRequired = 2 * (Math.max(0, input.busLengthM) / CAN_VELOCITY_M_PER_S + trx);
  const marginNs = (tSample - tRequired) * 1e9;
  return {
    limit,
    timing,
    timingMaxBusM,
    marginNs,
    busOk: input.busLengthM <= limit.maxBusM + 1e-9,
    stubOk: input.stubLengthM <= limit.maxStubM + 1e-9,
    timingOk: timing.solvable && marginNs >= -1,
    selected: limit.baud === input.baud
  };
}

export function analyzeCan(input: CanInput): CanResult {
  const warnings: string[] = [];
  const rows = CAN_BAUD_LIMITS.map((limit) => rowFor(input, limit));
  const selected = rows.find((row) => row.selected) ?? rows[2];
  const term = termination(input.termination, input.splitCapNf);
  const mcu = MCU_LIMITS[input.mcu];

  if (!selected.timing.solvable) {
    warnings.push(`No bit timing in the 8–25 TQ window fits ${input.clockMhz} MHz at ${selected.limit.label} on ${mcu.label}.`);
  } else if (selected.timing.ppm > 50) {
    warnings.push(`Baud error is ${selected.timing.ppm.toFixed(0)} ppm. Classical CAN wants a much closer integer division.`);
  }
  if (selected.timing.solvable && Math.abs(selected.timing.samplePoint * 100 - input.samplePointPct) > 2.5) {
    warnings.push(
      `Closest sample point is ${(selected.timing.samplePoint * 100).toFixed(2)}%, against a ${input.samplePointPct.toFixed(1)}% target.`
    );
  }
  if (!selected.busOk) {
    warnings.push(`Bus length ${input.busLengthM.toFixed(2)} m exceeds the ${selected.limit.maxBusM} m ISO 11898-2 limit at ${selected.limit.label}.`);
  }
  if (!selected.stubOk) {
    warnings.push(`Stub ${input.stubLengthM.toFixed(2)} m exceeds the ${selected.limit.maxStubM} m multi-drop guideline.`);
  }
  if (selected.timing.solvable && !selected.timingOk) {
    warnings.push("Sample point is earlier than the round trip of this bus plus the transceiver delay. Lower the bit rate, shorten the bus, or sample later.");
  }
  if (input.termination === "split" && term.cutoffHz !== null && term.cutoffHz < 150e3) {
    warnings.push("Split-cap cutoff is under 150 kHz. That is a heavy common-mode shunt; 4.7 nF is the usual automotive value.");
  }

  return {
    mcuLabel: mcu.label,
    timing: selected.timing,
    rows,
    termination: term,
    warnings
  };
}
