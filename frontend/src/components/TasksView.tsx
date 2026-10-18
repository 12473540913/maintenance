import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Completion, LedgerRow, Machine, TaskDefinition, TaskLedger } from "@maintenance/shared";
import { numberLedgerRows } from "@maintenance/shared";
import { api } from "../lib/api";
import { initialLedger, moveLedgerSection, redEntryCount, setTimelineColor, timelineColor, timelineLabel, type TimelineColor } from "../lib/ledger";
import { AnnualInspectionDialog } from "./AnnualInspectionDialog";
import { OverdueSnapshotDialog } from "./OverdueSnapshotDialog";
import { itemName } from "./ShopView";
import { useTaskRowDrag } from "../lib/useTaskRowDrag";

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
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const totalReds = draft.sections.reduce((total, section) => total + section.rows.reduce((count, row) => count + redEntryCount(row), 0), 0);
  const odometer = machine.currentOdometer;
  const odometerValue = typeof odometer === "number"
    ? `${odometer.toLocaleString("en-US")} mi`
    : odometer?.trim()
      ? `${Number.isFinite(Number(odometer)) ? Number(odometer).toLocaleString("en-US") : odometer} mi`
      : "—";
  useEffect(() => { if (!dirty) setDraft(ledger); }, [ledger, dirty]);
  const change = (next: TaskLedger) => { setDraft(numberLedgerRows(next)); setDirty(true); onDirty(true); };
  const changeRow = (sectionId: string, rowId: string, update: (row: LedgerRow) => LedgerRow) => change({
    ...draft, sections: draft.sections.map((section) => section.id !== sectionId ? section : { ...section, rows: section.rows.map((row) => row.id === rowId ? update(row) : row) })
  });
  const rowDrag = useTaskRowDrag(draft, change);
  const field = (label: string, value: string, onChange: (value: string) => void) => editing
    ? <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    : value || <span className="not-set">—</span>;
  return <section ref={rowDrag.rootRef} className={`item-ledger ${editing ? "editing" : "view-mode"}`} aria-label={`${itemName(machine)} tasks`}>
    <span className="sr-only" role="status">{rowDrag.announcement}</span>
    <div className="ledger-heading">
      <div className="ledger-heading-actions">
        <button type="button" className="button subtle annual-inspection-trigger" onClick={() => setAnnualInspectionOpen(true)}>Annual Inspection</button>
        <button type="button" className="button subtle annual-inspection-trigger" onClick={() => setSnapshotOpen(true)}>Snapshot</button>
      </div>
      <div className="ledger-heading-title"><h3>{itemName(machine)}</h3></div>
      {totalReds > 0 && <span className="ledger-red-count" aria-label={`${totalReds} red timeline ${totalReds === 1 ? "entry" : "entries"}`} title={`${totalReds} red timeline ${totalReds === 1 ? "entry" : "entries"}`}>{totalReds}</span>}
      <div className="ledger-heading-meta">
        <p className="ledger-odometer"><strong>{odometerValue}</strong></p>
        {editing && <div className="form-actions"><button className="button subtle" disabled={!dirty || saving} onClick={() => { setDraft(ledger); setDirty(false); onDirty(false); setError(""); }}>Discard</button><button className="button primary" disabled={!dirty || saving} onClick={async () => {
        const invalidSection = draft.sections.find((section) => !section.name.trim() || !section.code?.trim());
        if (invalidSection) {
          setError("Each section needs a name and a code before saving.");
          const section = Array.from(rowDrag.rootRef.current?.querySelectorAll<HTMLElement>("[data-task-section]") ?? []).find((entry) => entry.dataset.taskSection === invalidSection.id);
          section?.querySelector<HTMLInputElement>(!invalidSection.name.trim() ? '[aria-label="Section name"]' : '[aria-label="Section code"]')?.focus();
          return;
        }
        setSaving(true); setError("");
        try { const saved = await api.saveLedger({ ...draft, annualInspectionTasks: ledger.annualInspectionTasks, annualInspectionSections: ledger.annualInspectionSections, annualInspectionInstance: ledger.annualInspectionInstance }); onSaved(saved); setDirty(false); onDirty(false); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save tasks."); }
        finally { setSaving(false); }
      }}>{saving ? "Saving..." : "Save changes"}</button></div>}
      </div>
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    <fieldset disabled={saving} className="ledger-fields">
      {draft.sections.map((section) => <div className={`ledger-section${rowDrag.dropTarget?.sectionId === section.id && !rowDrag.dropTarget.beforeRowId ? " task-drop-at-end" : ""}`} data-task-section={section.id} key={section.id}>
        <div className="ledger-section-heading"><h4>{editing ? <>
          <input aria-label="Section name" required value={section.name} onChange={(event) => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, name: event.target.value } : entry) })} />
          <input className="section-code-input" aria-label="Section code" required value={section.code ?? ""} onChange={(event) => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, code: event.target.value } : entry) })} />
        </> : section.name || <span className="not-set">—</span>}</h4>
          {editing && <div className="task-row-actions"><button type="button" className="text-button danger" onClick={() => {
            if (section.rows.length && !window.confirm("Remove this section and its task rows?")) return;
            change({ ...draft, sections: draft.sections.filter((entry) => entry.id !== section.id) });
          }}>Remove section</button>
            <button type="button" className="text-button task-row-move" aria-label="Move section up" title="Move section up" disabled={draft.sections[0]?.id === section.id} onClick={() => change(moveLedgerSection(draft, section.id, -1))}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 7.5 4-4 4 4" /></svg></button>
            <button type="button" className="text-button task-row-move" aria-label="Move section down" title="Move section down" disabled={draft.sections[draft.sections.length - 1]?.id === section.id} onClick={() => change(moveLedgerSection(draft, section.id, 1))}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4.5 4 4 4-4" /></svg></button>
          </div>}
        </div>
        <div className="table-scroll"><table className="ledger-table"><thead><tr><th scope="col">ID</th><th scope="col">Task</th><th scope="col" className="timeline-heading">Timeline</th>{editing && <th scope="col"><span className="sr-only">Remove</span></th>}</tr></thead><tbody>
          {section.rows.map((row) => <tr key={row.id} data-task-row={row.id} className={`${rowDrag.draggedRowId === row.id ? "task-row-dragging" : ""}${rowDrag.dropTarget?.sectionId === section.id && rowDrag.dropTarget.beforeRowId === row.id ? " task-drop-before" : ""}`}>
            <td><div className="task-code">{row.code || <span className="not-set">—</span>}</div></td>
            <td className="task-description"><div className="task-description-content">{field("Task description", row.description, (description) => changeRow(section.id, row.id, (entry) => ({ ...entry, description })))}
              {redEntryCount(row) > 0 && <span className="task-red-marker" role="img" aria-label="Task has red timeline entries" title="Task has red timeline entries" />}
            </div></td>
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
              <button type="button" className="text-button task-row-drag-handle" aria-label={`Reorder task ${row.code || row.description || "row"}`} title="Drag to reorder; or use Up and Down keys" onPointerDown={(event) => rowDrag.start(event, section.id, row.id)} onKeyDown={(event) => {
                if (!rowDrag.draggedRowId && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                  event.preventDefault();
                  rowDrag.moveByKeyboard(section.id, row.id, event.key === "ArrowUp" ? -1 : 1);
                }
              }}><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 4h12M3 9h12M3 14h12" /></svg></button>
            </div></td>}
          </tr>)}
        </tbody></table></div>
        {!section.rows.length && <p className="section-empty">No task rows yet.</p>}
        {editing && <button className="text-button add-row" onClick={() => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, rows: [...entry.rows, { id: crypto.randomUUID(), code: "", action: "", description: "", timeline: [] }] } : entry) })}>+ Add task row</button>}
      </div>)}
      {!draft.sections.length && <p className="section-empty">{editing ? "Add a section to begin organizing tasks." : "No sections yet. Use Edit to create your own."}</p>}
      {editing && <button className="button subtle add-section" onClick={() => change({ ...draft, sections: [...draft.sections, { id: crypto.randomUUID(), name: "", code: "", rows: [] }] })}>+ Add section</button>}
    </fieldset>
    {annualInspectionOpen && <AnnualInspectionDialog machine={machine} ledger={ledger} onClose={() => setAnnualInspectionOpen(false)} onSaved={onSaved} />}
    {snapshotOpen && createPortal(<OverdueSnapshotDialog machine={machine} ledger={draft} onClose={() => setSnapshotOpen(false)} />, document.body)}
  </section>;
}
