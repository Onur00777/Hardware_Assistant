import { NextResponse } from "next/server";
import { asProject } from "@/lib/altium-script";
import { bomDocument } from "@/lib/exporters";
import { createProject } from "@/lib/preset";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(bomDocument(createProject()));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a HardwarePowerStudio project JSON body." }, { status: 400 });
  }
  const project = asProject(body);
  if (!project) {
    return NextResponse.json(
      {
        error:
          "Project must include name, traceRiseC, rails, loads, and the pcb, protection, regulator, magnetics, capacitance, harness, analog, and can sections."
      },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(bomDocument(project));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the BOM.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
