import { analyzePower } from "./engineering/power";
import type { Project } from "./types";

export const PRESET_NAME = "Formula Student Electric VCU & 4G Telemetry Power Profile";

export const PRESET: Project = {
  name: PRESET_NAME,
  traceRiseC: 10,
  rails: [
    {
      id: "glv",
      name: "24V GLV Battery",
      voltage: 24,
      parentId: null,
      kind: "source",
      efficiencyPct: 100,
      iqMa: 0
    },
    {
      id: "rail5",
      name: "5V Logic Buck",
      voltage: 5,
      parentId: "glv",
      kind: "buck",
      efficiencyPct: 92,
      iqMa: 0.15
    },
    {
      id: "rail3v3",
      name: "3.3V LDO",
      voltage: 3.3,
      parentId: "rail5",
      kind: "ldo",
      efficiencyPct: 100,
      iqMa: 0.04
    },
    {
      id: "rail3v8",
      name: "3.8V LTE Buck",
      voltage: 3.8,
      parentId: "glv",
      kind: "buck",
      efficiencyPct: 90,
      iqMa: 0.25
    }
  ],
  loads: [
    { id: "load-mcu-idle", name: "STM32 retention + RTC", railId: "rail3v3", mode: "idle", currentMa: 6, dutyPct: 100 },
    { id: "load-can-idle", name: "CAN transceivers standby", railId: "rail5", mode: "idle", currentMa: 0.05, dutyPct: 100 },
    { id: "load-sns-idle", name: "Sensor rail standby", railId: "rail3v3", mode: "idle", currentMa: 1.5, dutyPct: 100 },
    { id: "load-lte-idle", name: "Modem registered idle", railId: "rail3v8", mode: "idle", currentMa: 18, dutyPct: 100 },
    { id: "load-mcu", name: "STM32H7 run", railId: "rail3v3", mode: "active", currentMa: 140, dutyPct: 100 },
    { id: "load-sensors", name: "IMU, ADC, logger logic", railId: "rail3v3", mode: "active", currentMa: 35, dutyPct: 100 },
    { id: "load-gps", name: "GNSS receiver", railId: "rail3v3", mode: "active", currentMa: 28, dutyPct: 100 },
    { id: "load-sd", name: "SD card writes", railId: "rail3v3", mode: "active", currentMa: 45, dutyPct: 25 },
    { id: "load-can", name: "2× CAN transceivers", railId: "rail5", mode: "active", currentMa: 60, dutyPct: 100 },
    { id: "load-io", name: "Indicators and isolators", railId: "rail5", mode: "active", currentMa: 30, dutyPct: 70 },
    { id: "load-lte", name: "Modem connected, excl. TX", railId: "rail3v8", mode: "active", currentMa: 160, dutyPct: 100 },
    { id: "load-fan", name: "Radiator fan, high-side", railId: "glv", mode: "active", currentMa: 2500, dutyPct: 35 },
    { id: "load-lte-tx", name: "LTE/GSM TX burst", railId: "rail3v8", mode: "burst", currentMa: 2000, dutyPct: 12.5 }
  ],
  regulator: {
    architecture: "ldo",
    vin: 5,
    vout: 3.3,
    iout: 0.2,
    iqMa: 0.04,
    ta: 40,
    packageId: "SOT-223",
    rthOverride: null,
    fswKhz: 1500,
    rdsHsMo: 45,
    rdsLsMo: 22,
    trNs: 4,
    tfNs: 4,
    tDeadNs: 20,
    vsd: 0.7,
    dcrMo: 15,
    qgNc: 3.5,
    vdrive: 5
  },
  magnetics: {
    rippleFraction: 0.3,
    satMargin: 0.25,
    tempC: 40,
    inductorId: "sized",
    dcrMo: 15,
    volumeCm3: 0.1,
    mlccCase: "0603",
    mlccDielectric: "X7R",
    cNomUf: 22,
    vRated: 6.3,
    vdc: 3.8,
    esrMo: 8,
    mlccCount: 2,
    mlccTempC: 40
  },
  protection: {
    iRms: 1.57,
    iPeak: 3,
    systemV: 24,
    vSystemMax: 32,
    tvsId: "SMBJ33A",
    buckId: "LMR36520",
    pmosRdsOhm: 0.02,
    pmosRdsHotOhm: 0.032,
    lH: 4.7e-6,
    cF: 10e-6,
    rlOhm: 0.05,
    cdF: 47e-6,
    rdOhm: 0.68,
    lCoilH: 0.03,
    iCoilA: 0.5,
    vin: 24,
    pout: 20,
    eta: 0.9,
    fswHz: 400e3,
    fCrossHz: 0
  },
  harness: {
    ta: 40,
    vRail: 24,
    vAdcMax: 3.3,
    channels: [
      {
        id: "fan",
        name: "Radiator fan",
        switchId: "VNQ7050AJ",
        packageGroup: "vcu-quad",
        currentA: 2.5,
        lengthM: 1.5,
        areaMm2: 0.75,
        insulation: "xlpe",
        fuseA: 5,
        loadKind: "fan",
        capacitanceF: 0,
        inrushMultiple: 4,
        inrushMs: 200
      },
      {
        id: "pump",
        name: "Water pump",
        switchId: "VNQ7050AJ",
        packageGroup: "vcu-quad",
        currentA: 3,
        lengthM: 1.2,
        areaMm2: 0.75,
        insulation: "xlpe",
        fuseA: 7.5,
        loadKind: "fan",
        capacitanceF: 0,
        inrushMultiple: 4,
        inrushMs: 250
      },
      {
        id: "brake",
        name: "Brake light",
        switchId: "VNQ7050AJ",
        packageGroup: "vcu-quad",
        currentA: 2,
        lengthM: 2.5,
        areaMm2: 0.5,
        insulation: "pvc",
        fuseA: 5,
        loadKind: "lamp",
        capacitanceF: 0,
        inrushMultiple: 10,
        inrushMs: 80
      },
      {
        id: "sdc",
        name: "Shutdown circuit",
        switchId: "VNQ7050AJ",
        packageGroup: "vcu-quad",
        currentA: 0.4,
        lengthM: 3,
        areaMm2: 0.35,
        insulation: "xlpe",
        fuseA: 1,
        loadKind: "resistive",
        capacitanceF: 0,
        inrushMultiple: 1,
        inrushMs: 10
      },
      {
        id: "acc-fans",
        name: "Accumulator fans",
        switchId: "BTS7008-2EPA",
        packageGroup: "accu",
        currentA: 8,
        lengthM: 2,
        areaMm2: 1.5,
        insulation: "xlpe",
        fuseA: 15,
        loadKind: "fan",
        capacitanceF: 220e-6,
        inrushMultiple: 5,
        inrushMs: 300
      }
    ]
  },
  pcb: {
    currentA: 1.57,
    riseC: 10,
    oz: 1,
    viaDrillMm: 0.3,
    iPeak: 3,
    stackupId: "JLC04161H-7628",
    grid: 4,
    thermalPackage: "QFN",
    rPlane: 20,
    platingUm: 35
  },
  analog: {
    vinSense: 32,
    vAdcTarget: 3,
    series: "E96",
    r2Ohm: 10000,
    vref: 3.3,
    bits: 12,
    cAdcF: 5e-12,
    rAdcOhm: 1500,
    cFiltF: 100e-9,
    tSampleUs: 1,
    ntcR0: 10000,
    ntcBeta: 3950,
    ntcT0C: 25,
    rFixed: 10000,
    useSteinhart: false,
    shA: 0.001022284,
    shB: 1 / 3950,
    shC: 0
  },
  capacitance: {
    vNom: 3.8,
    dropMv: 200,
    iPeak: 2,
    burstUs: 577,
    responseUs: 80,
    esrFraction: 0.35,
    mlccRetention: 0.5
  },
  can: {
    baud: 500000,
    termination: "split",
    splitCapNf: 4.7,
    clockMhz: 80,
    samplePointPct: 80,
    mcu: "fdcan",
    busLengthM: 20,
    stubLengthM: 0.12,
    trxDelayNs: 150
  }
};

export function createProject(): Project {
  const project = structuredClone(PRESET) as Project;
  const power = analyzePower(project.rails, project.loads, project.traceRiseC);
  const rail = power.rails.find((item) => item.id === "rail3v3");
  if (rail) project.regulator.iout = Math.round(rail.out.mission.iRmsA * 1000) / 1000;
  return project;
}
