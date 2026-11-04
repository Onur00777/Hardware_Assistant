export function finite(n: number): boolean {
  return Number.isFinite(n);
}

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function fixed(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function trimFixed(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

export function fmtW(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

export function fmtA(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1) return `${n.toFixed(3)} A`;
  if (abs >= 0.01) return `${(n * 1000).toFixed(1)} mA`;
  return `${(n * 1000).toFixed(2)} mA`;
}

export function fmtV(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} V`;
}

export function fmtTemp(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

export function fmtMm(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

/** Editable display. Strips fractional trailing zeros and never eats a trailing integer zero. */
export function formatEditable(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "";
  const text = value.toFixed(Math.max(0, digits));
  if (digits <= 0) return text;
  return text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** Decimal places implied by a slider step such as 0.01. */
export function decimalsFromStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = step.toString().toLowerCase();
  if (text.includes("e-")) {
    const exp = Number(text.split("e-")[1]);
    return Number.isFinite(exp) ? exp : 0;
  }
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}
