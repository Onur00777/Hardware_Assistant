"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui";
import { useWorkbench } from "@/context/WorkbenchContext";
import { ALTIUM_JAVASCRIPT_FILENAME, ALTIUM_PASCAL_FILENAME, altiumDelphiScript, altiumJavaScript } from "@/lib/altium-script";
import { altiumRulesCsv, bomCsv, designReviewHtml, designReviewMarkdown, ltspiceAsc, ltspiceCir } from "@/lib/exporters";

function download(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const FILES: Array<{ file: string; title: string; detail: string; mime: string; build: (typeof ltspiceCir) }> = [
  { file: "hardware-power.cir", title: "LTspice netlist", detail: ".tran 5m deck: EMI filter, constant-power buck input, 3.8 V bulk, 577 µs LTE pulse.", mime: "text/plain", build: ltspiceCir },
  { file: "hardware-power.asc", title: "LTspice schematic", detail: "Schematic companion. The .cir file is the one to run.", mime: "text/plain", build: ltspiceAsc },
  { file: "altium-rules.csv", title: "Altium width and pair rules", detail: "Min, preferred and max for PWR_24V, PWR_5V, PWR_3V8_LTE, PWR_3V3, USB_90R, CAN_120R, and the component keep-out.", mime: "text/csv", build: altiumRulesCsv },
  { file: ALTIUM_PASCAL_FILENAME, title: "Altium DelphiScript", detail: "Runnable .pas. DXP » Run Script » HWPS_ImportRules writes net classes, IPC-2152 widths, CAN 120 Ω / USB 90 Ω pairs, and keep-outs into the focused PCB.", mime: "text/plain", build: altiumDelphiScript },
  { file: ALTIUM_JAVASCRIPT_FILENAME, title: "Altium JavaScript", detail: "Same import for Altium's JavaScript script engine. Not a Node script.", mime: "text/javascript", build: altiumJavaScript },
  { file: "power-bom.csv", title: "Power-stage BOM", detail: "Manufacturer part numbers for the bucks, ideal diode, TVS, high-side switches and the bulk network.", mime: "text/csv", build: bomCsv },
  { file: "design-review.md", title: "Design-review markdown", detail: "Thermal margin, fuse I²t, Middlebrook ratio and the LTE droop a judge can check.", mime: "text/markdown", build: designReviewMarkdown },
  { file: "design-review.html", title: "Printable dossier", detail: "Same review as HTML. Use the browser print dialog to make the PDF.", mime: "text/html", build: designReviewHtml }
];

export function ExportStudio() {
  const { project } = useWorkbench();
  const preview = useMemo(() => designReviewMarkdown(project).split("\n").slice(0, 28).join("\n"), [project]);
  const [bridge, setBridge] = useState<string | null>(null);

  async function callBridge(path: "/api/altium/export-rules" | "/api/altium/sync-bom") {
    setBridge("Contacting the local bridge…");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(project)
      });
      const payload = (await response.json()) as {
        error?: string;
        pascal?: { filename: string; source: string };
        javascript?: { filename: string; source: string };
        rules?: { widths: unknown[]; differentialPairs: unknown[]; keepouts: unknown[] };
        filename?: string;
        csv?: string;
        rows?: unknown[];
      };
      if (!response.ok) {
        setBridge(payload.error ?? "The bridge rejected the project.");
        return;
      }
      if (path === "/api/altium/export-rules" && payload.pascal && payload.javascript && payload.rules) {
        download(payload.pascal.filename, payload.pascal.source, "text/plain");
        download(payload.javascript.filename, payload.javascript.source, "text/javascript");
        setBridge(
          `POST ${path} returned ${payload.rules.widths.length} width rules, ${payload.rules.differentialPairs.length} differential pairs, and ${payload.rules.keepouts.length} keep-outs.`
        );
        return;
      }
      if (payload.filename && payload.csv && payload.rows) {
        download(payload.filename, payload.csv, "text/csv");
        setBridge(`POST ${path} returned ${payload.rows.length} BOM rows.`);
        return;
      }
      setBridge("The bridge returned an unexpected payload.");
    } catch {
      setBridge("The local bridge did not answer. Start the app with npm run dev and try again.");
    }
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-3 xl:col-span-5">
        <Panel eyebrow="Altium bridge" title="Local REST endpoints">
          <p className="text-[12px] leading-relaxed text-slate-400">
            External EDA scripts POST the project JSON to <span className="font-mono text-slate-300">/api/altium/export-rules</span> and{" "}
            <span className="font-mono text-slate-300">/api/altium/sync-bom</span>. GET on either route returns the default Formula Student profile. These buttons send the board that is open now.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded-md border border-amber-400/30 px-3 py-1.5 text-xs text-amber-200" onClick={() => void callBridge("/api/altium/export-rules")}>
              POST export-rules
            </button>
            <button type="button" className="rounded-md border border-amber-400/30 px-3 py-1.5 text-xs text-amber-200" onClick={() => void callBridge("/api/altium/sync-bom")}>
              POST sync-bom
            </button>
          </div>
          {bridge ? <p className="mt-3 font-mono text-[11px] text-slate-300">{bridge}</p> : null}
        </Panel>
        {FILES.map((item) => (
          <Panel key={item.file} eyebrow="Download" title={item.title}>
            <p className="text-[12px] leading-relaxed text-slate-400">{item.detail}</p>
            <button
              type="button"
              className="mt-3 rounded-md border border-amber-400/30 px-3 py-1.5 text-xs text-amber-200"
              onClick={() => download(item.file, item.build(project), item.mime)}
            >
              {item.file}
            </button>
          </Panel>
        ))}
      </div>
      <div className="xl:col-span-7">
        <Panel eyebrow="Preview" title="Design review, first section">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-300">{preview}</pre>
        </Panel>
      </div>
    </div>
  );
}
