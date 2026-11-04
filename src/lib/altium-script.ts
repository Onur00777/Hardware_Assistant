/**
 * Altium Designer rule bridge.
 *
 * Widths are the same IPC-2152 external sizes written to altium-rules.csv.
 * Differential pairs are the CAN 120 Ω and USB 90 Ω solutions from the PCB studio.
 * Keep-outs are a 0.25 mm component-to-component clearance and a 0.50 mm copper
 * clearance from the 24 V net class to every other net.
 *
 * The generated DelphiScript and JavaScript run inside Altium Designer
 * (DXP » Run Script) with a PCB document focused. They are not Node programs.
 */

import { analyzePcb, widthMmForRise } from "./engineering/pcb";
import { analyzePower } from "./engineering/power";
import type { Project } from "./types";

export const ALTIUM_PASCAL_FILENAME = "HardwarePowerStudio_Rules.pas";
export const ALTIUM_JAVASCRIPT_FILENAME = "HardwarePowerStudio_Rules.js";

export interface AltiumWidthRule {
  netClass: string;
  currentA: number;
  minMm: number;
  preferredMm: number;
  maxMm: number;
}

export interface AltiumDiffRule {
  name: string;
  targetOhm: number;
  widthMm: number;
  gapMm: number;
  minWidthMm: number;
  preferredWidthMm: number;
  maxWidthMm: number;
  minGapMm: number;
  preferredGapMm: number;
  maxGapMm: number;
}

export interface AltiumKeepoutRule {
  name: string;
  ruleKind: "component" | "clearance";
  clearanceMm: number;
  scope1: string;
  scope2: string;
}

export interface AltiumDesignRules {
  widths: AltiumWidthRule[];
  differentialPairs: AltiumDiffRule[];
  keepouts: AltiumKeepoutRule[];
}

function railCurrent(project: Project, id: string): number {
  const power = analyzePower(project.rails, project.loads, project.traceRiseC);
  return power.rails.find((rail) => rail.id === id)?.out.mission.iRmsA ?? 0;
}

function mm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function diffRule(name: string, targetOhm: number, widthM: number, gapM: number): AltiumDiffRule {
  const widthMm = mm(widthM * 1e3);
  const gapMm = mm(gapM * 1e3);
  return {
    name,
    targetOhm,
    widthMm,
    gapMm,
    minWidthMm: widthMm,
    preferredWidthMm: widthMm,
    maxWidthMm: mm(widthMm + 0.05),
    minGapMm: gapMm,
    preferredGapMm: gapMm,
    maxGapMm: mm(gapMm + 0.05)
  };
}

export function altiumDesignRules(project: Project): AltiumDesignRules {
  const pcb = project.pcb;
  const nets: Array<[string, number]> = [
    ["PWR_24V", Math.max(railCurrent(project, "glv"), 1)],
    ["PWR_5V", Math.max(railCurrent(project, "rail5"), 0.2)],
    ["PWR_3V8_LTE", Math.max(railCurrent(project, "rail3v8"), 0.5)],
    ["PWR_3V3", Math.max(railCurrent(project, "rail3v3"), 0.2)]
  ];
  const widths = nets.map(([netClass, currentA]) => {
    const exact = widthMmForRise(currentA, pcb.riseC, "external", pcb.oz);
    const hot = widthMmForRise(currentA, Math.max(pcb.riseC, 20), "external", pcb.oz);
    const preferred = Math.max(0.2, exact);
    const min = Math.max(0.2, Math.min(hot, preferred));
    const max = Math.max(preferred * 2, preferred + 0.5);
    return {
      netClass,
      currentA,
      minMm: mm(min),
      preferredMm: mm(preferred),
      maxMm: mm(max)
    };
  });
  const solved = analyzePcb(pcb);
  return {
    widths,
    differentialPairs: [
      diffRule("USB_90R", 90, solved.usb.wM, solved.usb.sM),
      diffRule("CAN_120R", 120, solved.can.wM, solved.can.sM)
    ],
    keepouts: [
      {
        name: "HWPS_ComponentKeepout",
        ruleKind: "component",
        clearanceMm: 0.25,
        scope1: "All",
        scope2: "All"
      },
      {
        name: "HWPS_PWR_24V_Clearance",
        ruleKind: "clearance",
        clearanceMm: 0.5,
        scope1: "InNetClass('PWR_24V')",
        scope2: "All"
      }
    ]
  };
}

function csvEscape(value: string | number): string {
  const text = String(value);
  if (text.includes(",") || text.includes('"')) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function formatAltiumRulesCsv(rules: AltiumDesignRules): string {
  const rows: Array<[string, string, string, string, string]> = [];
  for (const width of rules.widths) {
    rows.push(["Width", width.netClass, width.minMm.toFixed(3), width.preferredMm.toFixed(3), width.maxMm.toFixed(3)]);
  }
  for (const pair of rules.differentialPairs) {
    rows.push(["DiffPairWidth", pair.name, pair.minWidthMm.toFixed(3), pair.preferredWidthMm.toFixed(3), pair.maxWidthMm.toFixed(3)]);
    rows.push(["DiffPairGap", pair.name, pair.minGapMm.toFixed(3), pair.preferredGapMm.toFixed(3), pair.maxGapMm.toFixed(3)]);
  }
  for (const keepout of rules.keepouts) {
    const kind = keepout.ruleKind === "component" ? "KeepOut" : "Clearance";
    const gap = keepout.clearanceMm.toFixed(3);
    rows.push([kind, keepout.name, gap, gap, gap]);
  }
  const header = "Rule,NetClass,Min_mm,Preferred_mm,Max_mm";
  return [header, ...rows.map((row) => row.map(csvEscape).join(","))].join("\n") + "\n";
}

function plain(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function pascalString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

function num(value: number): string {
  return value.toFixed(3);
}

export function altiumDelphiScript(project: Project): string {
  const rules = altiumDesignRules(project);
  const title = plain(project.name) || "HardwarePowerStudio";
  const netCalls = rules.widths
    .map((rule) => `  EnsureNetClass(Board, ${pascalString(rule.netClass)});`)
    .join("\n");
  const widthCalls = rules.widths
    .map(
      (rule) =>
        `  EnsureWidthRule(Board, ${pascalString(`HWPS_${rule.netClass}_Width`)}, ${pascalString(`InNetClass('${rule.netClass}')`)}, ${num(rule.minMm)}, ${num(rule.preferredMm)}, ${num(rule.maxMm)});`
    )
    .join("\n");
  const diffClassCalls = rules.differentialPairs
    .map((rule) => `  EnsureDiffClass(Board, ${pascalString(rule.name)});`)
    .join("\n");
  const diffCalls = rules.differentialPairs
    .map(
      (rule) =>
        `  EnsureDiffRule(Board, ${pascalString(`HWPS_${rule.name}`)}, ${pascalString(`InDifferentialPairClass('${rule.name}')`)}, ${num(rule.minWidthMm)}, ${num(rule.preferredWidthMm)}, ${num(rule.maxWidthMm)}, ${num(rule.minGapMm)}, ${num(rule.preferredGapMm)}, ${num(rule.maxGapMm)});`
    )
    .join("\n");
  const keepoutCalls = rules.keepouts
    .map((rule) =>
      rule.ruleKind === "component"
        ? `  EnsureComponentKeepout(Board, ${pascalString(rule.name)}, ${num(rule.clearanceMm)});`
        : `  EnsureClearance(Board, ${pascalString(rule.name)}, ${pascalString(rule.scope1)}, ${pascalString(rule.scope2)}, ${num(rule.clearanceMm)});`
    )
    .join("\n");
  const widthNotes = rules.widths
    .map((rule) => `{   ${rule.netClass}: ${num(rule.minMm)} / ${num(rule.preferredMm)} / ${num(rule.maxMm)} mm at ${rule.currentA.toFixed(3)} A }`)
    .join("\n");
  const diffNotes = rules.differentialPairs
    .map((rule) => `{   ${rule.name}: W ${num(rule.widthMm)} mm, S ${num(rule.gapMm)} mm, target ${rule.targetOhm} ohm }`)
    .join("\n");

  return `{ HardwarePowerStudio Altium Designer rule bridge
  Project: ${title}
  Run from DXP >> Run Script with a PCB document focused.
  Entry point: HWPS_ImportRules
  Re-running updates rules that already use these HWPS_ names.

  IPC-2152 external width, min / preferred / max:
${widthNotes}
  Differential pairs:
${diffNotes}
  Keep-outs:
{   HWPS_ComponentKeepout: 0.250 mm component-to-component }
{   HWPS_PWR_24V_Clearance: 0.500 mm from InNetClass('PWR_24V') to All }
  Name the board nets PWR_24V, PWR_5V, PWR_3V8_LTE and PWR_3V3.
  Name the differential pair classes CAN_120R and USB_90R.
}

Function Mm(Value : Double) : TCoord;
Begin
  Result := MMsToCoord(Value);
End;

Function FindNamedRule(Board : IPCB_Board; const RuleName : String) : IPCB_Rule;
Var
  Iterator : IPCB_BoardIterator;
  Rule : IPCB_Rule;
Begin
  Result := Nil;
  Iterator := Board.BoardIterator_Create;
  Iterator.AddFilter_ObjectSet(MkSet(eRuleObject));
  Iterator.AddFilter_LayerSet(AllLayers);
  Iterator.AddFilter_Method(eProcessAll);
  Rule := Iterator.FirstPCBObject;
  While Rule <> Nil Do
  Begin
    If Rule.Name = RuleName Then
    Begin
      Result := Rule;
      Break;
    End;
    Rule := Iterator.NextPCBObject;
  End;
  Board.BoardIterator_Destroy(Iterator);
End;

Function FindClass(Board : IPCB_Board; const ClassName : String; WantDiff : Boolean) : IPCB_ObjectClass;
Var
  Iterator : IPCB_BoardIterator;
  ObjClass : IPCB_ObjectClass;
  Kind : TClassMemberKind;
Begin
  Result := Nil;
  If WantDiff Then
    Kind := eClassMemberKind_DiffPair
  Else
    Kind := eClassMemberKind_Net;
  Iterator := Board.BoardIterator_Create;
  Iterator.AddFilter_ObjectSet(MkSet(eClassObject));
  Iterator.AddFilter_LayerSet(AllLayers);
  Iterator.AddFilter_Method(eProcessAll);
  ObjClass := Iterator.FirstPCBObject;
  While ObjClass <> Nil Do
  Begin
    If (ObjClass.MemberKind = Kind) And (ObjClass.Name = ClassName) Then
    Begin
      Result := ObjClass;
      Break;
    End;
    ObjClass := Iterator.NextPCBObject;
  End;
  Board.BoardIterator_Destroy(Iterator);
End;

Procedure EnsureClass(Board : IPCB_Board; const ClassName : String; WantDiff : Boolean);
Var
  ObjClass : IPCB_ObjectClass;
Begin
  ObjClass := FindClass(Board, ClassName, WantDiff);
  If ObjClass = Nil Then
  Begin
    If WantDiff Then
      ObjClass := PCBServer.PCBClassFactoryByClassMember(eClassMemberKind_DiffPair)
    Else
      ObjClass := PCBServer.PCBClassFactoryByClassMember(eClassMemberKind_Net);
    If ObjClass = Nil Then Exit;
    ObjClass.Name := ClassName;
    Board.AddPCBObject(ObjClass);
  End;
  ObjClass.AddMemberByName(ClassName);
End;

Procedure EnsureNetClass(Board : IPCB_Board; const ClassName : String);
Begin
  EnsureClass(Board, ClassName, False);
End;

Procedure EnsureDiffClass(Board : IPCB_Board; const ClassName : String);
Begin
  EnsureClass(Board, ClassName, True);
End;

Procedure EnsureWidthRule(Board : IPCB_Board; const RuleName, Scope : String; MinMm, PrefMm, MaxMm : Double);
Var
  Rule : IPCB_Rule;
Begin
  Rule := FindNamedRule(Board, RuleName);
  If Rule = Nil Then
  Begin
    Rule := PCBServer.PCBRuleFactory(eRule_MaxMinWidth);
    Rule.Name := RuleName;
    Board.AddBoardRule(Rule);
  End;
  Rule.Scope1Expression := Scope;
  Rule.MinWidth := Mm(MinMm);
  Rule.PreferredWidth := Mm(PrefMm);
  Rule.MaxWidth := Mm(MaxMm);
End;

Procedure EnsureDiffRule(Board : IPCB_Board; const RuleName, Scope : String; MinW, PrefW, MaxW, MinG, PrefG, MaxG : Double);
Var
  Rule : IPCB_Rule;
Begin
  Rule := FindNamedRule(Board, RuleName);
  If Rule = Nil Then
  Begin
    Rule := PCBServer.PCBRuleFactory(eRule_DiffPairsRouting);
    Rule.Name := RuleName;
    Board.AddBoardRule(Rule);
  End;
  Rule.Scope1Expression := Scope;
  Rule.MinWidth := Mm(MinW);
  Rule.PreferredWidth := Mm(PrefW);
  Rule.MaxWidth := Mm(MaxW);
  Rule.MinGap := Mm(MinG);
  Rule.PreferredGap := Mm(PrefG);
  Rule.MaxGap := Mm(MaxG);
End;

Procedure EnsureComponentKeepout(Board : IPCB_Board; const RuleName : String; GapMm : Double);
Var
  Rule : IPCB_Rule;
Begin
  Rule := FindNamedRule(Board, RuleName);
  If Rule = Nil Then
  Begin
    Rule := PCBServer.PCBRuleFactory(eRule_ComponentClearance);
    Rule.Name := RuleName;
    Board.AddBoardRule(Rule);
  End;
  Rule.Scope1Expression := 'All';
  Rule.Scope2Expression := 'All';
  Rule.Gap := Mm(GapMm);
End;

Procedure EnsureClearance(Board : IPCB_Board; const RuleName, Scope1, Scope2 : String; GapMm : Double);
Var
  Rule : IPCB_Rule;
Begin
  Rule := FindNamedRule(Board, RuleName);
  If Rule = Nil Then
  Begin
    Rule := PCBServer.PCBRuleFactory(eRule_Clearance);
    Rule.Name := RuleName;
    Board.AddBoardRule(Rule);
  End;
  Rule.Scope1Expression := Scope1;
  Rule.Scope2Expression := Scope2;
  Rule.Gap := Mm(GapMm);
End;

Procedure HWPS_ImportRules;
Var
  Board : IPCB_Board;
Begin
  Board := PCBServer.GetCurrentPCBBoard;
  If Board = Nil Then
  Begin
    ShowMessage('Open a PCB document, then run HWPS_ImportRules.');
    Exit;
  End;

  PCBServer.PreProcess;
${netCalls}
${diffClassCalls}
${widthCalls}
${diffCalls}
${keepoutCalls}
  PCBServer.PostProcess;
  Board.ViewManager_FullUpdate;
  ShowMessage('HardwarePowerStudio rules are on this PCB.');
End;
`;
}

export function altiumJavaScript(project: Project): string {
  const rules = altiumDesignRules(project);
  const title = plain(project.name) || "HardwarePowerStudio";
  const netCalls = rules.widths.map((rule) => `  EnsureNetClass(board, ${jsString(rule.netClass)});`).join("\n");
  const widthCalls = rules.widths
    .map(
      (rule) =>
        `  EnsureWidthRule(board, ${jsString(`HWPS_${rule.netClass}_Width`)}, ${jsString(`InNetClass('${rule.netClass}')`)}, ${num(rule.minMm)}, ${num(rule.preferredMm)}, ${num(rule.maxMm)});`
    )
    .join("\n");
  const diffClassCalls = rules.differentialPairs.map((rule) => `  EnsureDiffClass(board, ${jsString(rule.name)});`).join("\n");
  const diffCalls = rules.differentialPairs
    .map(
      (rule) =>
        `  EnsureDiffRule(board, ${jsString(`HWPS_${rule.name}`)}, ${jsString(`InDifferentialPairClass('${rule.name}')`)}, ${num(rule.minWidthMm)}, ${num(rule.preferredWidthMm)}, ${num(rule.maxWidthMm)}, ${num(rule.minGapMm)}, ${num(rule.preferredGapMm)}, ${num(rule.maxGapMm)});`
    )
    .join("\n");
  const keepoutCalls = rules.keepouts
    .map((rule) =>
      rule.ruleKind === "component"
        ? `  EnsureComponentKeepout(board, ${jsString(rule.name)}, ${num(rule.clearanceMm)});`
        : `  EnsureClearance(board, ${jsString(rule.name)}, ${jsString(rule.scope1)}, ${jsString(rule.scope2)}, ${num(rule.clearanceMm)});`
    )
    .join("\n");

  return `// HardwarePowerStudio Altium Designer rule bridge
// Project: ${title}
// Run from DXP >> Run Script with a PCB document focused.
// Entry point: HWPS_ImportRules
// This is Altium's JavaScript script engine, not Node.

function Mm(value) {
  return MMsToCoord(value);
}

function FindNamedRule(board, ruleName) {
  var iterator = board.BoardIterator_Create();
  iterator.AddFilter_ObjectSet(MkSet(eRuleObject));
  iterator.AddFilter_LayerSet(AllLayers);
  iterator.AddFilter_Method(eProcessAll);
  var rule = iterator.FirstPCBObject();
  var found = null;
  while (rule != null) {
    if (rule.Name == ruleName) {
      found = rule;
      break;
    }
    rule = iterator.NextPCBObject();
  }
  board.BoardIterator_Destroy(iterator);
  return found;
}

function FindClass(board, className, wantDiff) {
  var kind = wantDiff ? eClassMemberKind_DiffPair : eClassMemberKind_Net;
  var iterator = board.BoardIterator_Create();
  iterator.AddFilter_ObjectSet(MkSet(eClassObject));
  iterator.AddFilter_LayerSet(AllLayers);
  iterator.AddFilter_Method(eProcessAll);
  var objClass = iterator.FirstPCBObject();
  var found = null;
  while (objClass != null) {
    if (objClass.MemberKind == kind && objClass.Name == className) {
      found = objClass;
      break;
    }
    objClass = iterator.NextPCBObject();
  }
  board.BoardIterator_Destroy(iterator);
  return found;
}

function EnsureClass(board, className, wantDiff) {
  var objClass = FindClass(board, className, wantDiff);
  if (objClass == null) {
    objClass = PCBServer.PCBClassFactoryByClassMember(wantDiff ? eClassMemberKind_DiffPair : eClassMemberKind_Net);
    if (objClass == null) return;
    objClass.Name = className;
    board.AddPCBObject(objClass);
  }
  objClass.AddMemberByName(className);
}

function EnsureNetClass(board, className) {
  EnsureClass(board, className, false);
}

function EnsureDiffClass(board, className) {
  EnsureClass(board, className, true);
}

function EnsureWidthRule(board, ruleName, scope, minMm, prefMm, maxMm) {
  var rule = FindNamedRule(board, ruleName);
  if (rule == null) {
    rule = PCBServer.PCBRuleFactory(eRule_MaxMinWidth);
    rule.Name = ruleName;
    board.AddBoardRule(rule);
  }
  rule.Scope1Expression = scope;
  rule.MinWidth = Mm(minMm);
  rule.PreferredWidth = Mm(prefMm);
  rule.MaxWidth = Mm(maxMm);
}

function EnsureDiffRule(board, ruleName, scope, minW, prefW, maxW, minG, prefG, maxG) {
  var rule = FindNamedRule(board, ruleName);
  if (rule == null) {
    rule = PCBServer.PCBRuleFactory(eRule_DiffPairsRouting);
    rule.Name = ruleName;
    board.AddBoardRule(rule);
  }
  rule.Scope1Expression = scope;
  rule.MinWidth = Mm(minW);
  rule.PreferredWidth = Mm(prefW);
  rule.MaxWidth = Mm(maxW);
  rule.MinGap = Mm(minG);
  rule.PreferredGap = Mm(prefG);
  rule.MaxGap = Mm(maxG);
}

function EnsureComponentKeepout(board, ruleName, gapMm) {
  var rule = FindNamedRule(board, ruleName);
  if (rule == null) {
    rule = PCBServer.PCBRuleFactory(eRule_ComponentClearance);
    rule.Name = ruleName;
    board.AddBoardRule(rule);
  }
  rule.Scope1Expression = "All";
  rule.Scope2Expression = "All";
  rule.Gap = Mm(gapMm);
}

function EnsureClearance(board, ruleName, scope1, scope2, gapMm) {
  var rule = FindNamedRule(board, ruleName);
  if (rule == null) {
    rule = PCBServer.PCBRuleFactory(eRule_Clearance);
    rule.Name = ruleName;
    board.AddBoardRule(rule);
  }
  rule.Scope1Expression = scope1;
  rule.Scope2Expression = scope2;
  rule.Gap = Mm(gapMm);
}

function HWPS_ImportRules() {
  var board = PCBServer.GetCurrentPCBBoard();
  if (board == null) {
    ShowMessage("Open a PCB document, then run HWPS_ImportRules.");
    return;
  }
  PCBServer.PreProcess();
${netCalls}
${diffClassCalls}
${widthCalls}
${diffCalls}
${keepoutCalls}
  PCBServer.PostProcess();
  board.ViewManager_FullUpdate();
  ShowMessage("HardwarePowerStudio rules are on this PCB.");
}
`;
}

export function asProject(value: unknown): Project | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Project>;
  if (typeof record.name !== "string" || typeof record.traceRiseC !== "number") return null;
  if (!Array.isArray(record.rails) || !Array.isArray(record.loads)) return null;
  if (!record.pcb || !record.protection || !record.regulator || !record.magnetics) return null;
  if (!record.capacitance || !record.harness || !record.analog || !record.can) return null;
  return record as Project;
}

export function altiumBridgeDocument(project: Project) {
  const rules = altiumDesignRules(project);
  return {
    project: project.name,
    pascal: { filename: ALTIUM_PASCAL_FILENAME, source: altiumDelphiScript(project) },
    javascript: { filename: ALTIUM_JAVASCRIPT_FILENAME, source: altiumJavaScript(project) },
    csv: formatAltiumRulesCsv(rules),
    rules
  };
}
