import { describe, expect, it } from "vitest";
import { MachineSchema, numberLedgerRows, ProfileSchema, TaskLedgerSchema, type TaskDefinition, type TaskLedger } from "@maintenance/shared";
import { initialLedger, moveAnnualInspectionTask, moveLedgerRow, moveLedgerSection, placeLedgerRow, redEntryCount, setTimelineColor, timelineColor, timelineLabel } from "../../frontend/src/lib/ledger.js";

const tasks: TaskDefinition[] = [
  { id: "t1", machineId: "m1", name: "Change oil", category: "Engine", ruleId: "r1", notes: "Use specified oil" },
  { id: "t2", machineId: "m1", name: "Inspect leaks", category: "Engine", ruleId: "r1" },
  { id: "t3", machineId: "m1", name: "Rotate tires", category: "Wheels", ruleId: "r1" },
  { id: "t4", machineId: "m2", name: "Other item", category: "Engine", ruleId: "r1" }
];

describe("manual task ledgers", () => {
  it("generates sequential task codes from section codes and preserves stable row IDs and contents", () => {
    const ledger = initialLedger("m1", [], tasks);
    ledger.sections[0].code = " COR ";
    ledger.sections[1].code = "WHL";
    const original = structuredClone(ledger);
    const numbered = numberLedgerRows(ledger);
    expect(numbered.sections.map((section) => section.rows.map((row) => row.code))).toEqual([["COR-1", "COR-2"], ["WHL-1"]]);
    expect(numbered.sections[0].code).toBe("COR");
    expect(numbered.sections[0].rows[0]).toEqual({ ...ledger.sections[0].rows[0], code: "COR-1" });
    expect(ledger).toEqual(original);
    expect(TaskLedgerSchema.parse(JSON.parse(JSON.stringify(numbered)))).toEqual(numbered);
    const moved = numberLedgerRows(placeLedgerRow(numbered, numbered.sections[0].id, "t1", numbered.sections[1].id, "t3"));
    expect(moved.sections.map((section) => section.rows.map((row) => [row.id, row.code]))).toEqual([
      [["t2", "COR-1"]], [["t1", "WHL-1"], ["t3", "WHL-2"]]
    ]);
    const reordered = numberLedgerRows(moveLedgerRow(numbered, numbered.sections[0].id, "t2", -1));
    expect(reordered.sections[0].rows.map((row) => [row.id, row.code])).toEqual([["t2", "COR-1"], ["t1", "COR-2"]]);
    reordered.sections[0].rows.splice(0, 1);
    reordered.sections[0].code = "ENG";
    expect(numberLedgerRows(reordered).sections[0].rows[0].code).toBe("ENG-1");
    reordered.sections[0].rows.push({ ...reordered.sections[0].rows[0], id: "new-row", code: "" });
    expect(numberLedgerRows(reordered).sections[0].rows.map((row) => row.code)).toEqual(["ENG-1", "ENG-2"]);
  });
  it("accepts legacy sections without a code but rejects blank codes and unnamed coded sections", () => {
    const legacy = initialLedger("m1", [], tasks);
    legacy.sections[0].rows[0].code = "OLD-9";
    expect(TaskLedgerSchema.parse(legacy)).toEqual(legacy);
    expect(numberLedgerRows(legacy)).toEqual(legacy);
    expect(TaskLedgerSchema.safeParse({ ...legacy, sections: [{ ...legacy.sections[0], code: "" }] }).success).toBe(false);
    expect(TaskLedgerSchema.safeParse({ ...legacy, sections: [{ ...legacy.sections[0], code: "  " }] }).success).toBe(false);
    expect(TaskLedgerSchema.safeParse({ ...legacy, sections: [{ ...legacy.sections[0], code: "COR", name: "  " }] }).success).toBe(false);
    expect(TaskLedgerSchema.parse({ ...legacy, sections: [{ id: "empty", name: "Empty", code: "EMP", rows: [] }] }).sections[0].code).toBe("EMP");
  });
  it("places dragged rows at arbitrary positions, preserving all data and leaving the original untouched", () => {
    const ledger = initialLedger("m1", [], tasks);
    ledger.sections[0].rows[0].timeline = [{ id: "note", color: "green", label: "Kept note", value: "12,000" }];
    ledger.sections[0].rows[0].action = "Inspect";
    ledger.sections.push({ id: "empty", name: "Empty", rows: [] });
    const original = structuredClone(ledger);
    const source = ledger.sections[0].id;
    const target = ledger.sections[1].id;
    const moved = placeLedgerRow(ledger, source, "t1", target, "t3");
    expect(moved.sections.map((section) => section.rows.map((row) => row.id))).toEqual([["t2"], ["t1", "t3"], []]);
    expect(moved.sections[1].rows[0]).toBe(ledger.sections[0].rows[0]);
    const appended = placeLedgerRow(moved, target, "t1", target);
    expect(appended.sections[1].rows.map((row) => row.id)).toEqual(["t3", "t1"]);
    expect(placeLedgerRow(appended, target, "t1", target, "t3")).toEqual(moved);
    const intoEmpty = placeLedgerRow(appended, target, "t1", "empty");
    expect(intoEmpty.sections[2].rows).toEqual([ledger.sections[0].rows[0]]);
    expect(ledger).toEqual(original);
    expect(TaskLedgerSchema.parse(JSON.parse(JSON.stringify(intoEmpty)))).toEqual(intoEmpty);
    expect(initialLedger("m1", [intoEmpty], tasks)).toBe(intoEmpty);
  });
  it("does not dirty the ledger for unchanged or invalid drag destinations", () => {
    const ledger = initialLedger("m1", [], tasks);
    const source = ledger.sections[0].id;
    expect(placeLedgerRow(ledger, source, "t1", source, "t1")).toBe(ledger);
    expect(placeLedgerRow(ledger, source, "t1", source, "t2")).toBe(ledger);
    expect(placeLedgerRow(ledger, source, "t2", source)).toBe(ledger);
    expect(placeLedgerRow(ledger, source, "t1", "another-item-section")).toBe(ledger);
    expect(placeLedgerRow(ledger, source, "t1", source, "missing")).toBe(ledger);
    expect(placeLedgerRow(ledger, "missing", "t1", source)).toBe(ledger);
    expect(placeLedgerRow(ledger, source, "missing", source)).toBe(ledger);
  });
  it("counts individual red entries using the same explicit and legacy colors as the timeline", () => {
    const row = initialLedger("m1", [], tasks).sections[0].rows[0];
    expect(redEntryCount(row)).toBe(0);
    row.timeline = [
      { id: "red", label: "", value: "", color: "red" },
      { id: "legacy-red", label: " RED ", value: "10,000" },
      { id: "green", label: "red", value: "", color: "green" },
      { id: "note", label: "Replaced red filter", value: "" },
      { id: "orange", label: "orange", value: "" },
      { id: "blue", label: "", value: "red", color: "blue" },
      { id: "unset", label: "", value: "" }
    ];
    expect(redEntryCount(row)).toBe(2);
    row.timeline = row.timeline.map((entry) => setTimelineColor(entry, "green"));
    expect(redEntryCount(row)).toBe(0);
    row.timeline[0] = setTimelineColor(row.timeline[0], "red");
    expect(redEntryCount(row)).toBe(1);
    row.timeline = row.timeline.filter((entry) => entry.id !== "red");
    expect(redEntryCount(row)).toBe(0);
  });
  it("moves annual inspection tasks up and down within and across sections", () => {
    const sections = [{ id: "engine", name: "Engine" }, { id: "brakes", name: "Brakes" }];
    const tasks = [
      { id: "task-1", description: "Oil", sectionId: "engine" },
      { id: "task-2", description: "Filter", sectionId: "engine" },
      { id: "task-3", description: "Pads", sectionId: "brakes" },
      { id: "task-4", description: "Rotor", sectionId: "brakes" }
    ];

    expect(moveAnnualInspectionTask(tasks, sections, "task-2", -1).map((task) => task.id)).toEqual(["task-2", "task-1", "task-3", "task-4"]);
    expect(moveAnnualInspectionTask(tasks, sections, "task-2", 1)).toEqual([
      tasks[0],
      { ...tasks[1], sectionId: "brakes" },
      tasks[2],
      tasks[3]
    ]);
    expect(moveAnnualInspectionTask(tasks, sections, "task-3", -1)).toEqual([
      tasks[0],
      tasks[1],
      { ...tasks[2], sectionId: "engine" },
      tasks[3]
    ]);
    expect(moveAnnualInspectionTask(tasks, sections, "task-1", -1)).toBe(tasks);
    expect(moveAnnualInspectionTask(tasks, sections, "task-4", 1)).toBe(tasks);
    expect(tasks.map((task) => task.id)).toEqual(["task-1", "task-2", "task-3", "task-4"]);
  });
  it("moves annual inspection tasks into adjacent empty sections", () => {
    const sections = [{ id: "engine", name: "Engine" }, { id: "fluids", name: "Fluids" }, { id: "brakes", name: "Brakes" }];
    const tasks = [
      { id: "task-1", description: "Oil", sectionId: "engine" },
      { id: "task-2", description: "Pads", sectionId: "brakes" }
    ];
    const movedIntoEmpty = moveAnnualInspectionTask(tasks, sections, "task-1", 1);
    expect(movedIntoEmpty.find((task) => task.id === "task-1")?.sectionId).toBe("fluids");
    expect(movedIntoEmpty.filter((task) => task.sectionId === "fluids").map((task) => task.id)).toEqual(["task-1"]);
    const movedIntoBrakes = moveAnnualInspectionTask(movedIntoEmpty, sections, "task-1", 1);
    expect(movedIntoBrakes.filter((task) => task.sectionId === "brakes").map((task) => task.id)).toEqual(["task-1", "task-2"]);
  });
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
  it("reorders tasks within a section in either direction without mutating the ledger", () => {
    const ledger = initialLedger("m1", [], tasks);
    const original = structuredClone(ledger);
    const moved = moveLedgerRow(ledger, ledger.sections[0].id, "t1", 1);
    expect(moved.sections[0].rows.map((row) => row.id)).toEqual(["t2", "t1"]);
    expect(moved.sections[1]).toBe(ledger.sections[1]);
    expect(moveLedgerRow(moved, ledger.sections[0].id, "t1", -1)).toEqual(original);
    expect(ledger).toEqual(original);
  });
  it("moves boundary tasks to the adjacent section's top or bottom with all data intact", () => {
    const ledger = initialLedger("m1", [], tasks);
    const row = ledger.sections[0].rows[0];
    row.code = "ENG-1";
    row.action = "Inspect";
    row.timeline = [{ id: "e1", label: "Completed", value: "10,000", color: "green" }];
    const original = structuredClone(ledger);
    const movedUp = moveLedgerRow(ledger, ledger.sections[1].id, "t3", -1);
    expect(movedUp.sections.map((section) => section.rows.map((entry) => entry.id))).toEqual([["t1", "t2", "t3"], []]);
    expect(moveLedgerRow(movedUp, ledger.sections[0].id, "t3", 1)).toEqual(original);

    const movedDown = moveLedgerRow(ledger, ledger.sections[0].id, "t2", 1);
    expect(movedDown.sections.map((section) => section.rows.map((entry) => entry.id))).toEqual([["t1"], ["t2", "t3"]]);
    const movedAgain = moveLedgerRow(movedDown, ledger.sections[0].id, "t1", 1);
    expect(movedAgain.sections.map((section) => section.rows.map((entry) => entry.id))).toEqual([[], ["t1", "t2", "t3"]]);
    expect(movedAgain.sections[1].rows[0]).toBe(row);
    expect(movedAgain.machineId).toBe("m1");
    expect(ledger).toEqual(original);
    const saved = TaskLedgerSchema.parse(JSON.parse(JSON.stringify(movedAgain)));
    expect(saved).toEqual(movedAgain);
    expect(initialLedger("m1", [saved], tasks)).toBe(saved);
    expect(moveLedgerRow(movedAgain, ledger.sections[1].id, "t1", -1)).toEqual(movedDown);
  });
  it("moves into adjacent empty sections without skipping them", () => {
    const ledger = initialLedger("m1", [], tasks);
    ledger.sections.splice(1, 0, { id: "empty", name: "Empty", rows: [] });
    const movedDown = moveLedgerRow(ledger, ledger.sections[0].id, "t2", 1);
    expect(movedDown.sections.map((section) => section.rows.map((row) => row.id))).toEqual([["t1"], ["t2"], ["t3"]]);
    const movedUp = moveLedgerRow(ledger, ledger.sections[2].id, "t3", -1);
    expect(movedUp.sections.map((section) => section.rows.map((row) => row.id))).toEqual([["t1", "t2"], ["t3"], []]);
  });
  it("does not move tasks outside an item or move missing tasks", () => {
    const ledger = initialLedger("m1", [], tasks);
    expect(moveLedgerRow(ledger, ledger.sections[0].id, "t1", -1)).toBe(ledger);
    expect(moveLedgerRow(ledger, ledger.sections[1].id, "t3", 1)).toBe(ledger);
    expect(moveLedgerRow(ledger, "missing", "t1", 1)).toBe(ledger);
    expect(moveLedgerRow(ledger, ledger.sections[0].id, "missing", -1)).toBe(ledger);
    expect(moveLedgerRow(ledger, ledger.sections[0].id, "t4", 1)).toBe(ledger);
    expect(moveLedgerRow({ machineId: "m1", sections: [] }, "missing", "t1", 1)).toEqual({ machineId: "m1", sections: [] });
    const single = { ...ledger, sections: [{ ...ledger.sections[0], rows: [ledger.sections[0].rows[0]] }] };
    expect(moveLedgerRow(single, single.sections[0].id, "t1", -1)).toBe(single);
    expect(moveLedgerRow(single, single.sections[0].id, "t1", 1)).toBe(single);
    const empty = { ...ledger, sections: [{ id: "empty", name: "Empty", rows: [] }] };
    expect(moveLedgerRow(empty, "empty", "t1", 1)).toBe(empty);
  });
  it("accepts freely entered labels and timeline values with exact round-trip shape", () => {
    const ledger: TaskLedger = { machineId: "m1", sections: [{ id: "s1", name: "Any section", rows: [{ id: "t1", code: "ENG-1", action: "Inspect", description: "Check everything", timeline: [{ id: "e1", label: "5k / Jul 07", value: "NA" }, { id: "e2", label: "Whenever", value: "Not yet" }] }] }] };
    expect(TaskLedgerSchema.parse(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
    expect(TaskLedgerSchema.safeParse({ machineId: "", sections: [] }).success).toBe(false);
  });
  it("round-trips annual inspection sections and task assignments while accepting older ledgers", () => {
    const legacy = { machineId: "m1", sections: [], annualInspectionTasks: [{ id: "task-1", description: "Check brakes" }] };
    expect(TaskLedgerSchema.parse(legacy)).toEqual(legacy);

    const ledger: TaskLedger = {
      ...legacy,
      annualInspectionSections: [{ id: "brakes", name: "Brakes" }],
      annualInspectionTasks: [{ id: "task-1", description: "Check brakes", sectionId: "brakes" }]
    };
    expect(TaskLedgerSchema.parse(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
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
