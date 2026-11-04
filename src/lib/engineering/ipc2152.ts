/**
 * IPC-2152 conductor sizing.
 *
 * IPC-2152 publishes charts, not a closed form. The coefficients below are the
 * Brooks & Adam regression of those charts (D. G. Brooks and J. Adam,
 * "Trace Currents and Temperatures Revisited", 2015; the same fit KiCad uses):
 *
 *   ΔT = K · I^a · W^b · Th^c
 *
 * External, all copper weights: K = 215.3, a = 2, b = −1.15, c = −1.0
 * Internal, 1 oz:               K = 200,   a = 1.9, b = −1.10, c = −1.52
 *
 * I is amperes, W and Th are mils, ΔT is °C above ambient.
 * The external fit is for still air with no adjacent plane. A plane-backed
 * trace runs cooler, so a width from this fit is conservative on a 4-layer board.
 */

export const COPPER_1OZ_UM = 35;
export const COPPER_1OZ_MILS = COPPER_1OZ_UM / 25.4;
const MIL_TO_MM = 0.0254;
const FAB_MIN_MM = 0.2;
const WIDTH_QUANTUM_MM = 0.05;

export const IPC2152_EXTERNAL = { k: 215.3, iExp: 2, wExp: -1.15, thExp: -1 } as const;
export const IPC2152_INTERNAL_1OZ = { k: 200, iExp: 1.9, wExp: -1.1, thExp: -1.52 } as const;

export type CopperLayer = "external" | "internal";

export interface LayerTrace {
  exactMil: number;
  exactMm: number;
  recommendedMm: number;
  recommendedMil: number;
  riseAtRecommendedC: number;
  fabMinGoverns: boolean;
}

export interface TraceSizing {
  currentA: number;
  riseC: number;
  thicknessUm: number;
  thicknessMils: number;
  external: LayerTrace;
  internal: LayerTrace;
  usePour: boolean;
}

export function temperatureRiseC(
  currentA: number,
  widthMils: number,
  layer: CopperLayer,
  thicknessMils = COPPER_1OZ_MILS
): number {
  if (!(currentA > 0) || !(widthMils > 0) || !(thicknessMils > 0)) return 0;
  if (layer === "external") {
    return (
      IPC2152_EXTERNAL.k *
      currentA ** IPC2152_EXTERNAL.iExp *
      widthMils ** IPC2152_EXTERNAL.wExp *
      thicknessMils ** IPC2152_EXTERNAL.thExp
    );
  }
  return (
    IPC2152_INTERNAL_1OZ.k *
    currentA ** IPC2152_INTERNAL_1OZ.iExp *
    widthMils ** IPC2152_INTERNAL_1OZ.wExp *
    thicknessMils ** IPC2152_INTERNAL_1OZ.thExp
  );
}

export function widthMilsForRise(
  currentA: number,
  riseC: number,
  layer: CopperLayer,
  thicknessMils = COPPER_1OZ_MILS
): number {
  if (!(currentA > 0) || !(riseC > 0) || !(thicknessMils > 0)) return 0;
  if (layer === "external") {
    const { k, iExp, wExp, thExp } = IPC2152_EXTERNAL;
    const numerator = k * currentA ** iExp;
    const denominator = riseC * thicknessMils ** -thExp;
    return (numerator / denominator) ** (1 / -wExp);
  }
  const { k, iExp, wExp, thExp } = IPC2152_INTERNAL_1OZ;
  const numerator = k * currentA ** iExp;
  const denominator = riseC * thicknessMils ** -thExp;
  return (numerator / denominator) ** (1 / -wExp);
}

function practicalWidth(exactMils: number, currentA: number, layer: CopperLayer): LayerTrace {
  const exactMm = exactMils * MIL_TO_MM;
  const fabMinGoverns = !(exactMm > FAB_MIN_MM);
  const snapped = Math.ceil(Math.max(0, exactMm - 1e-6) / WIDTH_QUANTUM_MM) * WIDTH_QUANTUM_MM;
  const recommendedMm = Number(Math.max(FAB_MIN_MM, snapped).toFixed(2));
  const recommendedMil = recommendedMm / MIL_TO_MM;
  return {
    exactMil: exactMils,
    exactMm,
    recommendedMm,
    recommendedMil,
    riseAtRecommendedC: temperatureRiseC(currentA, recommendedMil, layer),
    fabMinGoverns
  };
}

/** Size an external and an internal 1 oz conductor for a temperature rise. */
export function sizeTrace(currentA: number, riseC: number): TraceSizing {
  const i = Math.max(0, currentA);
  const rise = Math.max(1, riseC);
  const external = practicalWidth(widthMilsForRise(i, rise, "external"), i, "external");
  const internal = practicalWidth(widthMilsForRise(i, rise, "internal"), i, "internal");
  return {
    currentA: i,
    riseC: rise,
    thicknessUm: COPPER_1OZ_UM,
    thicknessMils: COPPER_1OZ_MILS,
    external,
    internal,
    usePour: external.recommendedMm > 5
  };
}
