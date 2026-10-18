import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LedgerRow, Machine, TaskLedger } from "@maintenance/shared";
import { OverdueSnapshotDialog, snapshotSections } from "./OverdueSnapshotDialog";

const row = (id: string, timeline: LedgerRow["timeline"]): LedgerRow => ({
  id, code: `ID-${id}`, action: "", description: `Description ${id}`, timeline
});
const red = { id: "red", color: "red" as const, label: "", value: "" };
const machine: Machine = { id: "m1", code: "BIKE", type: "motorcycle", name: "Test bike", currentOdometer: 12345 };
const render = (ledger: TaskLedger, item = machine) => renderToStaticMarkup(createElement(OverdueSnapshotDialog, { machine: item, ledger, onClose: () => {} }));

describe("overdue snapshot", () => {
  it("lists only red tasks once, in section order, with continuous numbering and their IDs and descriptions", () => {
    const ledger: TaskLedger = {
      machineId: "m1",
      sections: [
        { id: "engine", name: "Engine", rows: [
          row("oil", [red, { ...red, id: "red-2" }]),
          row("filter", [{ id: "green", color: "green", label: "red", value: "" }])
        ] },
        { id: "empty", name: "No overdue section", rows: [] },
        { id: "wheels", name: "Wheels", rows: [
          row("tires", [{ id: "legacy", label: " RED ", value: "" }]),
          row("brakes", [red]),
          row("future", [{ id: "future", color: "blue", label: "", value: "" }]),
          row("upcoming", [{ id: "upcoming", color: "orange", label: "", value: "" }]),
          row("unset", [])
        ] }
      ]
    };
    const before = JSON.stringify(ledger);
    const html = render(ledger);
    expect(html).toContain("Overdue Snapshot");
    expect(html).toContain('aria-label="Close overdue snapshot"');
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html.match(/class="overdue-snapshot-red-marker"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="4 red timeline entries"');
    expect(html).toContain('title="4 red timeline entries">4</span>');
    expect(html).toContain('<ol start="1">');
    expect(html).toContain('<ol start="2">');
    for (const id of ["oil", "tires", "brakes"]) {
      expect(html.match(new RegExp(`ID-${id}`, "g"))).toHaveLength(1);
      expect(html).toContain(`Description ${id}`);
    }
    for (const id of ["filter", "future", "upcoming", "unset"]) expect(html).not.toContain(`ID-${id}`);
    expect(html).not.toContain("No overdue section");
    expect(html.indexOf("Engine")).toBeLessThan(html.indexOf("Wheels"));
    expect(html.indexOf("ID-tires")).toBeLessThan(html.indexOf("ID-brakes"));
    expect(html).not.toMatch(/<(input|textarea|select)\b/);
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Include upcoming");
    expect(html).toContain(">Print</button>");
    expect(JSON.stringify(ledger)).toBe(before);
  });

  it("shows the item name, current ODO, and dashboard-style current month/year", () => {
    const ledger: TaskLedger = { machineId: "m1", sections: [] };
    const html = render(ledger);
    expect(html).toContain("Overdue Snapshot - Test bike");
    expect(html).toContain("12,345 mi");
    expect(html).toMatch(/<span aria-label="Current odometer">12,345 mi<\/span><time /);
    expect(html).not.toContain("<strong");
    expect(html).toContain(new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date()));
    expect(render(ledger, { ...machine, name: "", currentOdometer: 0 })).toContain("Overdue Snapshot - BIKE");
    expect(render(ledger, { ...machine, currentOdometer: "12000" })).toContain("12,000 mi");
    expect(render(ledger, { ...machine, currentOdometer: "unknown" })).toContain("unknown mi");
    expect(render(ledger, { ...machine, currentOdometer: 0 })).toContain("0 mi");
    expect(render(ledger, { ...machine, currentOdometer: undefined })).toContain('aria-label="Current odometer">—');
  });

  it("selects the first matching due value and includes orange tasks only when they have no red entries", () => {
    const orange = { id: "orange", label: "", color: "orange" as const, value: "Next month" };
    const ledger: TaskLedger = { machineId: "m1", sections: [
      { id: "engine", name: "Engine", rows: [
        row("mixed", [orange, { ...red, value: "10,000 mi" }, { ...red, id: "later", value: "15,000 mi" }]),
        row("upcoming", [{ id: "done", color: "green", label: "", value: "Past value" }, orange]),
        row("legacy-red", [{ id: "legacy-red", label: " RED ", value: "Last year" }, orange])
      ] },
      { id: "wheels", name: "Wheels", rows: [
        row("legacy-orange", [{ id: "legacy-orange", label: " ORANGE ", value: "Spring" }]),
        row("future", [{ id: "blue", color: "blue", label: "", value: "Future" }])
      ] }
    ] };
    const before = JSON.stringify(ledger);
    const overdue = snapshotSections(ledger, "red");
    expect(overdue.map((section) => section.rows.map((row) => [row.id, row.due]))).toEqual([
      [["mixed", "10,000 mi"], ["legacy-red", "Last year"]]
    ]);
    const upcoming = snapshotSections(ledger, "orange");
    expect(upcoming.map((section) => ({ name: section.name, start: section.start, rows: section.rows.map((row) => [row.id, row.due]) }))).toEqual([
      { name: "Engine", start: 1, rows: [["upcoming", "Next month"]] },
      { name: "Wheels", start: 2, rows: [["legacy-orange", "Spring"]] }
    ]);
    const html = render(ledger);
    expect(html).toContain('aria-label="Due">10,000 mi');
    expect(html).toContain('aria-label="Due">Last year');
    expect(html).not.toContain("Next month");
    expect(html).not.toContain("Past value");
    expect(JSON.stringify(ledger)).toBe(before);
  });

  it("shows an empty state for empty ledgers and sections with no red tasks", () => {
    expect(render({ machineId: "m1", sections: [] })).toContain("No overdue tasks.");
    const html = render({ machineId: "m1", sections: [{ id: "s1", name: "Engine", rows: [row("oil", [])] }] });
    expect(html).toContain("No overdue tasks.");
    expect(html).not.toContain("<ol");
    expect(html).not.toContain('class="overdue-snapshot-red-count"');
    expect(html).not.toContain('class="overdue-snapshot-red-marker"');
  });

  it("reflects current task colors, IDs, descriptions and section names without saving", () => {
    const ledger: TaskLedger = { machineId: "m1", sections: [{ id: "s1", name: "", rows: [row("oil", [red])] }] };
    expect(render(ledger)).toContain("Untitled section");
    expect(render(ledger)).toContain('aria-label="1 red timeline entry"');
    ledger.sections[0].name = "Updated section";
    ledger.sections[0].rows[0].code = "NEW-ID";
    ledger.sections[0].rows[0].description = "Updated description";
    const html = render(ledger);
    expect(html).toContain("Updated section");
    expect(html).toContain("NEW-ID");
    expect(html).toContain("Updated description");
    ledger.sections[0].rows[0].timeline[0].color = "green";
    expect(render(ledger)).toContain("No overdue tasks.");
  });
});
