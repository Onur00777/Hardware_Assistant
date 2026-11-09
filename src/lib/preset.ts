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

export type BoardPresetId = "tl27" | "vcu" | "telemetry" | "stress";

export interface PresetMeta {
  id: BoardPresetId;
  label: string;
  group?: "workspace" | "template" | "test";
  isPersonal?: boolean;
}

export const BOARD_PRESETS: PresetMeta[] = [
  {
    id: "tl27",
    label: "TL27 DAQ & Telemetry — Onur Yüksek (STM32H745 + Dual CAN-FD + Quectel LTE + LMR14030)",
    group: "workspace",
    isPersonal: true
  },
  {
    id: "vcu",
    label: "IST27 VCU Board (STM32H745 + Dual Isolated CAN + 4x High-Side Drivers + APPS/BSE Analog)",
    group: "template"
  },
  {
    id: "telemetry",
    label: "IST27 Telemetry & Datalogger (STM32H743 + Quectel LTE Cat-1 + GNSS + SDMMC + IMU)",
    group: "template"
  },
  {
    id: "stress",
    label: "Combined Stress Fault Case (SOT-23 Thermal Runaway + Undamped EMI Filter + Insufficient LTE Bulk Cap)",
    group: "test"
  }
];

export function createEmptyProject(name = "Yeni Donanım Çalışma Alanı"): Project {
  const p = createProject();
  p.name = name;
  p.loads = [
    { id: "load-mcu", name: "Ana MCU", railId: "rail3v3", mode: "active", currentMa: 80, dutyPct: 100 }
  ];
  return p;
}

export function createBoard(id: BoardPresetId): Project {
  const project = createProject();
  if (id === "tl27") {
    project.name = "TL27 DAQ & Telemetry (Onur Yüksek) — STM32H745 + Dual CAN-FD + Quectel LTE";
    project.rails = [
      {
        id: "glv",
        name: "24V GLV Input (+24V_RAW)",
        voltage: 24,
        parentId: null,
        kind: "source",
        efficiencyPct: 100,
        iqMa: 0
      },
      {
        id: "rail5",
        name: "5V System Buck (U1 LMR14030 + TPS2116)",
        voltage: 5,
        parentId: "glv",
        kind: "buck",
        efficiencyPct: 91,
        iqMa: 0.04
      },
      {
        id: "rail3v8",
        name: "3.8V GSM / LTE Buck (U2 LMR14030)",
        voltage: 3.8,
        parentId: "glv",
        kind: "buck",
        efficiencyPct: 89,
        iqMa: 0.04
      },
      {
        id: "rail3v3",
        name: "3.3V MCU VDD (D4 AMS1117-3.3)",
        voltage: 3.3,
        parentId: "rail5",
        kind: "ldo",
        efficiencyPct: 100,
        iqMa: 5
      }
    ];

    project.loads = [
      { id: "load-mcu-idle", name: "STM32H745 Standby / RTC", railId: "rail3v3", mode: "idle", currentMa: 15, dutyPct: 100 },
      { id: "load-mcu", name: "STM32H745 Dual-Core (M7+M4 @ 480MHz)", railId: "rail3v3", mode: "active", currentMa: 185, dutyPct: 100 },
      { id: "load-sd", name: "Micro SD (SDMMC1 4-bit write)", railId: "rail3v3", mode: "active", currentMa: 55, dutyPct: 35 },
      { id: "load-txb", name: "TXB0108 Level Shifter + Sensors", railId: "rail3v3", mode: "active", currentMa: 8, dutyPct: 100 },
      { id: "load-led3v3", name: "D_3V3 Power LED", railId: "rail3v3", mode: "active", currentMa: 2, dutyPct: 100 },

      { id: "load-can-standby", name: "2× MCP2562FD CAN Standby", railId: "rail5", mode: "idle", currentMa: 10, dutyPct: 100 },
      { id: "load-can", name: "2× MCP2562FD Active CAN-FD (Bus drive)", railId: "rail5", mode: "active", currentMa: 85, dutyPct: 60 },
      { id: "load-mux", name: "TPS2116 PWR MUX + Power Fail Sense", railId: "rail5", mode: "active", currentMa: 3, dutyPct: 100 },

      { id: "load-lte-idle", name: "Quectel LTE DRX Standby", railId: "rail3v8", mode: "idle", currentMa: 22, dutyPct: 100 },
      { id: "load-lte", name: "Quectel LTE Connected (RX)", railId: "rail3v8", mode: "active", currentMa: 180, dutyPct: 100 },
      { id: "load-led3v8", name: "D_3V8 GSM LED", railId: "rail3v8", mode: "active", currentMa: 2, dutyPct: 100 },
      { id: "load-lte-tx", name: "Quectel LTE / GSM TX Burst", railId: "rail3v8", mode: "burst", currentMa: 2000, dutyPct: 12.5 }
    ];

    const refreshed = analyzePower(project.rails, project.loads, project.traceRiseC);
    const rail = refreshed.rails.find((item) => item.id === "rail3v3");
    if (rail) project.regulator.iout = Math.round(rail.out.mission.iRmsA * 1000) / 1000;

    project.regulator = {
      architecture: "ldo",
      vin: 5,
      vout: 3.3,
      iout: Math.round((rail?.out.mission.iRmsA ?? 0.25) * 1000) / 1000,
      iqMa: 5,
      ta: 40,
      packageId: "SOT-223",
      rthOverride: 62,
      fswKhz: 400,
      rdsHsMo: 90,
      rdsLsMo: 0,
      trNs: 10,
      tfNs: 10,
      tDeadNs: 0,
      vsd: 0.45,
      dcrMo: 35,
      qgNc: 3.5,
      vdrive: 5
    };

    project.magnetics = {
      rippleFraction: 0.3,
      satMargin: 0.25,
      tempC: 40,
      inductorId: "sized",
      dcrMo: 35,
      volumeCm3: 0.38,
      mlccCase: "1206",
      mlccDielectric: "X7R",
      cNomUf: 47,
      vRated: 16,
      vdc: 3.8,
      esrMo: 5,
      mlccCount: 2,
      mlccTempC: 40
    };

    project.protection = {
      iRms: 0.85,
      iPeak: 2.5,
      systemV: 24,
      vSystemMax: 28,
      tvsId: "SMBJ28A",
      buckId: "LMR14030",
      pmosRdsOhm: 0.02,
      pmosRdsHotOhm: 0.032,
      lH: 10e-6,
      cF: 20e-6,
      rlOhm: 0.035,
      cdF: 100e-6,
      rdOhm: 0.7,
      lCoilH: 0.01,
      iCoilA: 0.3,
      vin: 24,
      pout: 12,
      eta: 0.9,
      fswHz: 400e3,
      fCrossHz: 40e3
    };

    project.harness = {
      ta: 40,
      vRail: 24,
      vAdcMax: 3.3,
      channels: [
        {
          id: "tl27-feed",
          name: "TL27 24V Infeed + 2000uF Hold Bank",
          switchId: "VNQ7050AJ",
          packageGroup: "tl27",
          currentA: 1.2,
          lengthM: 1.8,
          areaMm2: 0.5,
          insulation: "xlpe",
          fuseA: 3,
          loadKind: "capacitive",
          capacitanceF: 2000e-6,
          inrushMultiple: 3,
          inrushMs: 50
        }
      ]
    };

    project.analog = {
      vinSense: 24,
      vAdcTarget: 2.57,
      series: "E96",
      r2Ohm: 12000,
      vref: 3.3,
      bits: 16,
      cAdcF: 5e-12,
      rAdcOhm: 1000,
      cFiltF: 10e-9,
      tSampleUs: 1.5,
      ntcR0: 10000,
      ntcBeta: 3950,
      ntcT0C: 25,
      rFixed: 10000,
      useSteinhart: false,
      shA: 0.001022284,
      shB: 1 / 3950,
      shC: 0
    };

    project.can = {
      baud: 500000,
      termination: "split",
      splitCapNf: 4.7,
      clockMhz: 80,
      samplePointPct: 80,
      mcu: "fdcan",
      busLengthM: 15,
      stubLengthM: 0.1,
      trxDelayNs: 120
    };

    project.capacitance = {
      vNom: 3.8,
      dropMv: 200,
      iPeak: 2,
      burstUs: 577,
      responseUs: 60,
      esrFraction: 0.35,
      mlccRetention: 0.65
    };
  }
  if (id === "vcu") {
    project.name = BOARD_PRESETS[0].label;
    project.loads = project.loads
      .filter((load) => !load.id.startsWith("load-lte") && load.id !== "load-gps" && load.id !== "load-sd")
      .map((load) => (load.id === "load-mcu" ? { ...load, name: "STM32H745 run" } : load));
    project.loads.push(
      { id: "apps", name: "APPS1 / APPS2", railId: "rail5", mode: "active", currentMa: 12, dutyPct: 100 },
      { id: "bse", name: "Brake pressure transducer", railId: "rail5", mode: "active", currentMa: 10, dutyPct: 100 }
    );
    const refreshed = analyzePower(project.rails, project.loads, project.traceRiseC);
    const rail = refreshed.rails.find((item) => item.id === "rail3v3");
    if (rail) project.regulator.iout = Math.round(rail.out.mission.iRmsA * 1000) / 1000;
    project.regulator.packageId = "SOT-223";
    project.regulator.architecture = "ldo";
    project.harness.channels = project.harness.channels.map((channel) =>
      channel.id === "brake" ? { ...channel, name: "Brake light", inrushMultiple: 4 } : channel.id === "sdc" ? { ...channel, name: "RTDS / shutdown" } : channel
    );
    project.analog = { ...project.analog, vinSense: 32, vAdcTarget: 3, series: "E96", r2Ohm: 10000 };
    project.can = { ...project.can, mcu: "fdcan", baud: 500000 };
  }
  if (id === "telemetry") {
    project.name = BOARD_PRESETS[1].label;
    project.loads = project.loads
      .filter((load) => load.id !== "load-fan")
      .map((load) => (load.id === "load-mcu" ? { ...load, name: "STM32H743 run" } : load.id === "load-lte" ? { ...load, name: "Quectel LTE Cat-1 connected" } : load));
    project.regulator = {
      ...project.regulator,
      architecture: "buck",
      vin: 24,
      vout: 3.8,
      iout: 0.8,
      iqMa: 0.25,
      packageId: "QFN",
      rthOverride: null,
      fswKhz: 2100
    };
    project.harness.channels = project.harness.channels.filter((channel) => channel.id === "sdc").map((channel) => ({ ...channel, currentA: 0.3, loadKind: "resistive" as const }));
    project.capacitance = { ...project.capacitance, iPeak: 2, burstUs: 577, dropMv: 200, mlccRetention: 0.5 };
  }
  if (id === "stress") {
    project.name = BOARD_PRESETS[2].label;
    project.regulator = {
      ...project.regulator,
      architecture: "ldo",
      vin: 5,
      vout: 3.3,
      iout: 0.45,
      iqMa: 5,
      ta: 55,
      packageId: "SOT-23",
      rthOverride: null
    };
    project.protection = { ...project.protection, rdOhm: 0, cdF: 0, buckId: "MP2315", tvsId: "SMBJ33A" };
    project.capacitance = {
      ...project.capacitance,
      iPeak: 6,
      burstUs: 2000,
      dropMv: 40,
      responseUs: 250,
      mlccRetention: 0.15,
      esrFraction: 0.35
    };
    project.harness.channels = project.harness.channels.map((channel) =>
      channel.id === "brake" ? { ...channel, inrushMultiple: 12, inrushMs: 80 } : channel
    );
  }
  return project;
}
