import { useEffect, useState } from "react";
import type { Completion, LedgerRow, Machine, TaskDefinition, TaskLedger } from "@maintenance/shared";
import { api } from "../lib/api";
import { initialLedger, moveLedgerRow, moveLedgerSection, setTimelineColor, timelineColor, timelineLabel, type TimelineColor } from "../lib/ledger";
import { AnnualInspectionDialog } from "./AnnualInspectionDialog";
import { itemName } from "./ShopView";

export function TasksView({ machines, ledgers, tasks, completions, onSaved, onShop, onDirty }: {
  machines: Machine[]; ledgers: TaskLedger[]; tasks: TaskDefinition[]; completions: Completion[]; onSaved: (ledger: TaskLedger) => void; onShop: () => void; onDirty: (dirty: boolean) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(false);
  const [dirtyMachines, setDirtyMachines] = useState<Set<string>>(() => new Set());
  const dirty = dirtyMachines.size > 0;
  const allSelected = filter === "all";
  const currentDate = new Date();
  const currentMonthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(currentDate);
  const allButton = <button className={`button ${allSelected ? "primary" : "subtle"}`} disabled={dirty || !machines.length} onClick={() => setFilter(allSelected ? machines[0].id! : "all")} aria-pressed={allSelected}>All</button>;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return <main className="tasks-page" aria-label="Tasks">
    <div className="tasks-toolbar">
      <div className="item-filters" role="group" aria-label="Filter tasks by item">
        {allButton}
        {machines.map((machine) => <button key={machine.id} className={`button ${filter === machine.id ? "primary" : "subtle"}`} disabled={dirty} onClick={() => setFilter(machine.id!)} aria-pressed={filter === machine.id}>{itemName(machine)}</button>)}
      </div>
      <div className="tasks-actions">
        <time className="tasks-current-date" dateTime={currentDate.toISOString()}>{currentMonthYear}</time>
        <button className={`button ${editing ? "primary" : "subtle"}`} disabled={dirty} onClick={() => setEditing(!editing)} aria-pressed={editing}>{editing ? "Done editing" : "Edit"}</button>
      </div>
    </div>
    {editing && <p className="edit-help">Create your own sections and rows. Task arrows move rows up or down; at a section boundary, they move the task into the adjacent section within the same item. Timeline values are free text; choose a status color for each entry. Green entries can include a text note. Save each item's changes before leaving edit mode.</p>}
    {!machines.length && <div className="empty"><h3>Start with an item</h3><p>Add a car, bike, or anything else you maintain to your shop.</p><button className="button primary" onClick={onShop}>Open shop</button></div>}
    {machines.filter((machine) => filter === "all" || machine.id === filter).map((machine) => machine.id && <ItemLedger key={machine.id} machine={machine} ledger={initialLedger(machine.id, ledgers, tasks, completions)} editing={editing} onSaved={onSaved} onDirty={(value) => {
      setDirtyMachines((current) => { const next = new Set(current); if (value) next.add(machine.id!); else next.delete(machine.id!); return next; });
    }} />)}
  </main>;

}

function ItemLedger({ machine, ledger, editing, onSaved, onDirty }: {
  machine: Machine; ledger: TaskLedger; editing: boolean; onSaved: (ledger: TaskLedger) => void; onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(ledger);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [annualInspectionOpen, setAnnualInspectionOpen] = useState(false);
  const odometer = machine.currentOdometer;
  const odometerValue = typeof odometer === "number"
    ? `${odometer.toLocaleString("en-US")} mi`
    : odometer?.trim()
      ? `${Number.isFinite(Number(odometer)) ? Number(odometer).toLocaleString("en-US") : odometer} mi`
      : "—";
  useEffect(() => { if (!dirty) setDraft(ledger); }, [ledger, dirty]);
  const change = (next: TaskLedger) => { setDraft(next); setDirty(true); onDirty(true); };
  const changeRow = (sectionId: string, rowId: string, update: (row: LedgerRow) => LedgerRow) => change({
    ...draft, sections: draft.sections.map((section) => section.id !== sectionId ? section : { ...section, rows: section.rows.map((row) => row.id === rowId ? update(row) : row) })
  });
  const moveRow = (sectionId: string, rowId: string, offset: -1 | 1) => change(moveLedgerRow(draft, sectionId, rowId, offset));
  const field = (label: string, value: string, onChange: (value: string) => void) => editing
    ? <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    : value || <span className="not-set">—</span>;
  return <section className={`item-ledger ${editing ? "editing" : "view-mode"}`} aria-label={`${itemName(machine)} tasks`}>
    <div className="ledger-heading">
      <button type="button" className="button subtle annual-inspection-trigger" onClick={() => setAnnualInspectionOpen(true)}>Annual Inspection</button>
      <div className="ledger-heading-title"><h3>{itemName(machine)}</h3></div>
      <div className="ledger-heading-meta">
        <p className="ledger-odometer"><strong>{odometerValue}</strong></p>
        {editing && <div className="form-actions"><button className="button subtle" disabled={!dirty || saving} onClick={() => { setDraft(ledger); setDirty(false); onDirty(false); setError(""); }}>Discard</button><button className="button primary" disabled={!dirty || saving} onClick={async () => {
        setSaving(true); setError("");
        try { const saved = await api.saveLedger({ ...draft, annualInspectionTasks: ledger.annualInspectionTasks, annualInspectionSections: ledger.annualInspectionSections, annualInspectionInstance: ledger.annualInspectionInstance }); onSaved(saved); setDirty(false); onDirty(false); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save tasks."); }
        finally { setSaving(false); }
      }}>{saving ? "Saving..." : "Save changes"}</button></div>}
      </div>
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    <fieldset disabled={saving} className="ledger-fields">
      {draft.sections.map((section, sectionIndex) => <div className="ledger-section" key={section.id}>
        <div className="ledger-section-heading"><h4>{field("Section name", section.name, (name) => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, name } : entry) }))}</h4>
          {editing && <div className="task-row-actions"><button type="button" className="text-button danger" onClick={() => {
            if (section.rows.length && !window.confirm("Remove this section and its task rows?")) return;
            change({ ...draft, sections: draft.sections.filter((entry) => entry.id !== section.id) });
          }}>Remove section</button>
            <button type="button" className="text-button task-row-move" aria-label="Move section up" title="Move section up" disabled={draft.sections[0]?.id === section.id} onClick={() => change(moveLedgerSection(draft, section.id, -1))}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 7.5 4-4 4 4" /></svg></button>
            <button type="button" className="text-button task-row-move" aria-label="Move section down" title="Move section down" disabled={draft.sections[draft.sections.length - 1]?.id === section.id} onClick={() => change(moveLedgerSection(draft, section.id, 1))}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4.5 4 4 4-4" /></svg></button>
          </div>}
        </div>
        <div className="table-scroll"><table className="ledger-table"><thead><tr><th scope="col">ID</th><th scope="col">Task</th><th scope="col" className="timeline-heading">Timeline</th>{editing && <th scope="col"><span className="sr-only">Remove</span></th>}</tr></thead><tbody>
          {section.rows.map((row, rowIndex) => <tr key={row.id}>
            <td>{field("Task ID", row.code, (code) => changeRow(section.id, row.id, (entry) => ({ ...entry, code })))}</td>
            <td>{field("Task description", row.description, (description) => changeRow(section.id, row.id, (entry) => ({ ...entry, description })))}</td>
            <td className="timeline-cell"><div className="timeline-entries">{row.timeline.map((entry) => {
              const color = timelineColor(entry);
              const label = timelineLabel(entry);
              return <div className={`timeline-entry${color ? ` timeline-status-${color}` : ""}`} key={entry.id}>
              <div className="timeline-value">{field("Timeline value", entry.value, (value) => changeRow(section.id, row.id, (current) => ({ ...current, timeline: current.timeline.map((cell) => cell.id === entry.id ? { ...cell, value } : cell) })))}</div>
              <div className="timeline-label">{editing
                ? <select aria-label="Timeline status" value={color ?? ""} onChange={(event) => {
                  const nextColor = event.target.value as TimelineColor | "";
                  changeRow(section.id, row.id, (current) => ({ ...current, timeline: current.timeline.map((cell) => cell.id === entry.id ? setTimelineColor(cell, nextColor) : cell) }));
                }}>
                  <option value="">Select status</option>
                  <option value="red">Red - Expected done</option>
                  <option value="green">Green - Done (text)</option>
                  <option value="orange">Orange - Upcoming</option>
                  <option value="blue">Blue - Future</option>
                </select>
                : color === "green" ? label || <span className="not-set">—</span> : null}</div>
              {editing && color === "green" && <div className="timeline-note">{field("Timeline note", label, (nextLabel) => changeRow(section.id, row.id, (current) => ({ ...current, timeline: current.timeline.map((cell) => cell.id === entry.id ? { ...cell, label: nextLabel } : cell) })))}</div>}
              {editing && <button className="text-button danger" aria-label="Remove timeline entry" onClick={() => changeRow(section.id, row.id, (current) => ({ ...current, timeline: current.timeline.filter((cell) => cell.id !== entry.id) }))}>Remove</button>}
            </div>;
            })}
              {!editing && !row.timeline.length && <span className="not-set">No entries</span>}
              {editing && <button className="text-button" onClick={() => changeRow(section.id, row.id, (current) => ({ ...current, timeline: [...current.timeline, { id: crypto.randomUUID(), label: "", value: "" }] }))}>+ Entry</button>}
            </div></td>
            {editing && <td><div className="task-row-actions">
              <button type="button" className="text-button danger" aria-label="Remove task row" onClick={() => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, rows: entry.rows.filter((task) => task.id !== row.id) } : entry) })}>Remove</button>
              <button type="button" className="text-button task-row-move" aria-label="Move task up" title={rowIndex === 0 && sectionIndex > 0 ? "Move task to bottom of previous section" : "Move task up"} disabled={rowIndex === 0 && sectionIndex === 0} onClick={() => moveRow(section.id, row.id, -1)}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 7.5 4-4 4 4" /></svg></button>
              <button type="button" className="text-button task-row-move" aria-label="Move task down" title={rowIndex === section.rows.length - 1 && sectionIndex < draft.sections.length - 1 ? "Move task to top of next section" : "Move task down"} disabled={rowIndex === section.rows.length - 1 && sectionIndex === draft.sections.length - 1} onClick={() => moveRow(section.id, row.id, 1)}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4.5 4 4 4-4" /></svg></button>
            </div></td>}
          </tr>)}
        </tbody></table></div>
        {!section.rows.length && <p className="section-empty">No task rows yet.</p>}
        {editing && <button className="text-button add-row" onClick={() => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, rows: [...entry.rows, { id: crypto.randomUUID(), code: "", action: "", description: "", timeline: [] }] } : entry) })}>+ Add task row</button>}
      </div>)}
      {!draft.sections.length && <p className="section-empty">{editing ? "Add a section to begin organizing tasks." : "No sections yet. Use Edit to create your own."}</p>}
      {editing && <button className="button subtle add-section" onClick={() => change({ ...draft, sections: [...draft.sections, { id: crypto.randomUUID(), name: "", rows: [] }] })}>+ Add section</button>}
    </fieldset>
    {annualInspectionOpen && <AnnualInspectionDialog machine={machine} ledger={ledger} onClose={() => setAnnualInspectionOpen(false)} onSaved={onSaved} />}
  </section>;
}
