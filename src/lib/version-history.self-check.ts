import assert from "node:assert/strict";
import { createBoard } from "./preset";
import { compareProjects, parseProjectBackup, parseVersions, parseWorkspaceStore, validVersionDate, type ProjectVersion } from "./version-history";

const project = createBoard("tl27");
const version: ProjectVersion = {
  id: "v14", number: 14, date: "2026-11-20", title: "TL27 v14", summary: "Güç katı güncellendi.",
  createdAt: "2026-11-20T10:00:00Z", snapshot: structuredClone(project)
};

assert.deepEqual(parseProjectBackup(project), { project, versions: [] });
const backup = parseProjectBackup({ ...project, versionHistory: [version] });
assert.deepEqual(backup.versions, [version]);
assert.equal("versionHistory" in backup.project, false);
assert.throws(() => parseVersions([version, { ...version, id: "another" }]));
assert.throws(() => parseVersions([{ ...version, snapshot: {} }]));
assert.throws(() => parseProjectBackup({ ...project, versionHistory: "invalid" }));
assert.equal(validVersionDate("2026-02-30"), false);
assert.equal(validVersionDate("2026-99-99"), false);
assert.equal(validVersionDate("2024-02-29"), true);
assert.deepEqual(parseVersions([{ ...version, number: 15, id: "v15" }, version]).map(item => item.number), [14, 15]);

const legacy = { id: "legacy", name: project.name, updatedAt: "20.11.2026", project };
assert.deepEqual(parseWorkspaceStore({ customProjects: [legacy], presetVersions: {} }).customProjects[0].versions, []);
assert.deepEqual(compareProjects(project, structuredClone(project)), []);
const changed = structuredClone(project);
changed.loads.reverse();
assert.deepEqual(compareProjects(project, changed), []);
changed.can.baud = 250000;
changed.loads[0].currentMa += 10;
const changes = compareProjects(project, changed);
assert.equal(changes.length, 2);
assert.ok(changes.some(item => item.field === "can.baud" && item.before === "500000" && item.after === "250000"));
assert.ok(changes.some(item => item.field.includes(changed.loads[0].id)));
assert.ok(changes.some(item => item.label === "Bit hızı (bit/s)"));
assert.ok(changes.some(item => item.label.includes(changed.loads[0].name)));
changed.rails.push({ ...changed.rails[1], id: "new-rail", name: "New rail" });
assert.ok(compareProjects(project, changed).some(item => item.field === "rails[new-rail].name" && item.before === "Eklenmemiş"));
changed.loads.pop();
assert.ok(compareProjects(project, changed).some(item => item.after === "Silinmiş"));
assert.deepEqual(parseWorkspaceStore(JSON.parse(JSON.stringify({
  customProjects: [{ ...legacy, versions: [version] }], presetVersions: { tl27: [{ ...version, snapshot: null }] }
}))).presetVersions.tl27[0].snapshot, null);
console.log("Version history checks passed.");
