"use client";

import { useMemo } from "react";
import { Panel } from "@/components/ui";
import { useWorkbench } from "@/context/WorkbenchContext";
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
  { file: "altium-rules.csv", title: "Altium width and pair rules", detail: "Min, preferred and max for PWR_24V, PWR_5V, PWR_3V8_LTE, PWR_3V3, USB_90R and CAN_120R.", mime: "text/csv", build: altiumRulesCsv },
  { file: "power-bom.csv", title: "Power-stage BOM", detail: "Manufacturer part numbers for the bucks, ideal diode, TVS, high-side switches and the bulk network.", mime: "text/csv", build: bomCsv },
  { file: "design-review.md", title: "Design-review markdown", detail: "Thermal margin, fuse I²t, Middlebrook ratio and the LTE droop a judge can check.", mime: "text/markdown", build: designReviewMarkdown },
  { file: "design-review.html", title: "Printable dossier", detail: "Same review as HTML. Use the browser print dialog to make the PDF.", mime: "text/html", build: designReviewHtml }
];

export function ExportStudio() {
  const { project } = useWorkbench();
  const preview = useMemo(() => designReviewMarkdown(project).split("\n").slice(0, 28).join("\n"), [project]);
  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-3 xl:col-span-5">
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
