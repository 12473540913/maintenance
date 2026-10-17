import { describe, expect, it } from "vitest";
import { MachineSchema, ProfileSchema, TaskLedgerSchema, type TaskDefinition, type TaskLedger } from "@maintenance/shared";
import { initialLedger, moveLedgerSection, setTimelineColor, timelineColor, timelineLabel } from "../../frontend/src/lib/ledger.js";

const tasks: TaskDefinition[] = [
  { id: "t1", machineId: "m1", name: "Change oil", category: "Engine", ruleId: "r1", notes: "Use specified oil" },
  { id: "t2", machineId: "m1", name: "Inspect leaks", category: "Engine", ruleId: "r1" },
  { id: "t3", machineId: "m1", name: "Rotate tires", category: "Wheels", ruleId: "r1" },
  { id: "t4", machineId: "m2", name: "Other item", category: "Engine", ruleId: "r1" }
];

describe("manual task ledgers", () => {
  it("groups existing tasks by item and section without changing their source", () => {
    const ledger = initialLedger("m1", [], tasks);
    expect(ledger.sections.map((section) => section.name)).toEqual(["Engine", "Wheels"]);
    expect(ledger.sections[0].rows.map((row) => row.description)).toEqual(["Change oil — Use specified oil", "Inspect leaks"]);
    expect(tasks[0].name).toBe("Change oil");
  });
  it("includes existing completion history, including zero mileage", () => {
    const ledger = initialLedger("m1", [], tasks, [{ id: "c1", taskDefinitionId: "t1", completedAt: "2026-01-01", odometer: 0, note: "Done" }]);
    expect(ledger.sections[0].rows[0].timeline).toEqual([{ id: "c1", label: "0 mi / 2026-01-01", value: "Done" }]);
  });
  it("keeps deliberately empty saved ledgers empty", () => {
    const saved: TaskLedger = { machineId: "m1", sections: [] };
    expect(initialLedger("m1", [saved], tasks)).toBe(saved);
  });
  it("moves whole sections in either direction without changing tasks or timeline entries", () => {
    const ledger = initialLedger("m1", [], tasks, [{ id: "c1", taskDefinitionId: "t1", completedAt: "2026-01-01", note: "Done" }]);
    ledger.sections.push({ id: "empty", name: "Empty", rows: [] });
    const original = structuredClone(ledger);
    const moved = moveLedgerSection(ledger, ledger.sections[0].id, 1);
    expect(moved.sections.map((section) => section.id)).toEqual([ledger.sections[1].id, ledger.sections[0].id, "empty"]);
    expect(moved.sections[1]).toBe(ledger.sections[0]);
    expect(moved.sections[1].rows).toHaveLength(2);
    expect(moved.sections[1].rows[0].timeline[0].value).toBe("Done");
    expect(ledger).toEqual(original);
    expect(moveLedgerSection(moved, ledger.sections[0].id, -1)).toEqual(original);
    expect(moveLedgerSection(ledger, "empty", -1).sections.map((section) => section.id)).toEqual([ledger.sections[0].id, "empty", ledger.sections[1].id]);
    expect(TaskLedgerSchema.parse(JSON.parse(JSON.stringify(moved)))).toEqual(moved);
    expect(initialLedger("m1", [moved], tasks)).toBe(moved);
  });
  it("does not move sections beyond the first or last position", () => {
    const ledger = initialLedger("m1", [], tasks);
    expect(moveLedgerSection(ledger, ledger.sections[0].id, -1)).toBe(ledger);
    expect(moveLedgerSection(ledger, ledger.sections[1].id, 1)).toBe(ledger);
    expect(moveLedgerSection(ledger, "missing", 1)).toBe(ledger);
    const empty: TaskLedger = { machineId: "m1", sections: [] };
    expect(moveLedgerSection(empty, "missing", -1)).toBe(empty);
    const single = { ...ledger, sections: [ledger.sections[0]] };
    expect(moveLedgerSection(single, single.sections[0].id, -1)).toBe(single);
    expect(moveLedgerSection(single, single.sections[0].id, 1)).toBe(single);
  });
  it("accepts freely entered labels and timeline values with exact round-trip shape", () => {
    const ledger: TaskLedger = { machineId: "m1", sections: [{ id: "s1", name: "Any section", rows: [{ id: "t1", code: "ENG-1", action: "Inspect", description: "Check everything", timeline: [{ id: "e1", label: "5k / Jul 07", value: "NA" }, { id: "e2", label: "Whenever", value: "Not yet" }] }] }] };
    expect(TaskLedgerSchema.parse(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
    expect(TaskLedgerSchema.safeParse({ machineId: "", sections: [] }).success).toBe(false);
  });
  it("preserves status colors through the legacy label field", () => {
    const entry = { id: "e1", label: "", value: "10,000" };
    const blue = setTimelineColor(entry, "blue");
    expect(blue).toMatchObject({ color: "blue", label: "blue" });
    const legacyBlue = { ...blue, color: undefined };
    expect(timelineColor(legacyBlue)).toBe("blue");
    expect(timelineLabel(legacyBlue)).toBe("");

    const green = setTimelineColor(entry, "green");
    expect(timelineColor({ ...green, color: undefined })).toBe("green");
    expect(timelineLabel(green)).toBe("");
    expect(timelineLabel(setTimelineColor({ ...green, label: "Completed" }, "green"))).toBe("Completed");
  });
});

describe("manual item and profile fields", () => {
  it("accepts free text without dropping numeric legacy data", () => {
    expect(MachineSchema.parse({ code: "CAR", type: "Car", year: "circa 2007", currentOdometer: "unknown", acquiredDate: "Last summer", name: "Rav4", imageUrl: "https://example.com/car.jpg" }).year).toBe("circa 2007");
    expect(MachineSchema.parse({ code: "CAR", type: "Car", year: 2007, currentOdometer: 0 }).currentOdometer).toBe(0);
  });
  it("validates and trims app-specific profile usernames", () => {
    expect(ProfileSchema.parse({ username: "  testuser  " })).toEqual({ username: "testuser" });
    expect(ProfileSchema.safeParse({ username: "  " }).success).toBe(false);
    expect(ProfileSchema.safeParse({ username: "x".repeat(101) }).success).toBe(false);
  });
});
