import { useEffect, useState } from "react";
import type { Completion, LedgerRow, Machine, TaskDefinition, TaskLedger } from "@maintenance/shared";
import { api } from "../lib/api";
import { initialLedger } from "../lib/ledger";
import { itemName } from "./ShopView";

export function TasksView({ machines, ledgers, tasks, completions, onSaved, onShop, onDirty }: {
  machines: Machine[]; ledgers: TaskLedger[]; tasks: TaskDefinition[]; completions: Completion[]; onSaved: (ledger: TaskLedger) => void; onShop: () => void; onDirty: (dirty: boolean) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(false);
  const [dirtyMachines, setDirtyMachines] = useState<Set<string>>(() => new Set());
  const dirty = dirtyMachines.size > 0;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return <main className="tasks-page">
    <div className="section-heading"><div><p className="eyebrow">MAINTENANCE LEDGER</p><h2>Tasks</h2></div><button className={`button ${editing ? "primary" : "subtle"}`} disabled={dirty} onClick={() => setEditing(!editing)} aria-pressed={editing}>{editing ? "Done editing" : "Edit"}</button></div>
    <div className="item-filters" aria-label="Filter tasks by item">
      <button className={filter === "all" ? "filter active" : "filter"} disabled={dirty} onClick={() => setFilter("all")} aria-pressed={filter === "all"}>All items</button>
      {machines.map((machine) => <button key={machine.id} className={filter === machine.id ? "filter active" : "filter"} disabled={dirty} onClick={() => setFilter(machine.id!)} aria-pressed={filter === machine.id}>{itemName(machine)}</button>)}
    </div>
    {editing && <p className="edit-help">Create your own sections and rows. Timeline labels and values are free text. Save each item's changes before leaving edit mode.</p>}
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
  useEffect(() => { if (!dirty) setDraft(ledger); }, [ledger, dirty]);
  const change = (next: TaskLedger) => { setDraft(next); setDirty(true); onDirty(true); };
  const changeRow = (sectionId: string, rowId: string, update: (row: LedgerRow) => LedgerRow) => change({
    ...draft, sections: draft.sections.map((section) => section.id !== sectionId ? section : { ...section, rows: section.rows.map((row) => row.id === rowId ? update(row) : row) })
  });
  const field = (label: string, value: string, onChange: (value: string) => void) => editing
    ? <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    : value || <span className="not-set">—</span>;
  return <section className="item-ledger" aria-label={`${itemName(machine)} tasks`}>
    <div className="ledger-heading"><div><h3>{itemName(machine)}</h3><span>{machine.code} · {machine.type}</span></div>
      {editing && <div className="form-actions"><button className="button subtle" disabled={!dirty || saving} onClick={() => { setDraft(ledger); setDirty(false); onDirty(false); setError(""); }}>Discard</button><button className="button primary" disabled={!dirty || saving} onClick={async () => {
        setSaving(true); setError("");
        try { const saved = await api.saveLedger(draft); onSaved(saved); setDirty(false); onDirty(false); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save tasks."); }
        finally { setSaving(false); }
      }}>{saving ? "Saving..." : "Save changes"}</button></div>}
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    <fieldset disabled={saving} className="ledger-fields">
      {draft.sections.map((section) => <div className="ledger-section" key={section.id}>
        <div className="ledger-section-heading"><h4>{field("Section name", section.name, (name) => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, name } : entry) }))}</h4>
          {editing && <button className="text-button danger" onClick={() => {
            if (section.rows.length && !window.confirm("Remove this section and its task rows?")) return;
            change({ ...draft, sections: draft.sections.filter((entry) => entry.id !== section.id) });
          }}>Remove section</button>}
        </div>
        <div className="table-scroll"><table className="ledger-table"><thead><tr><th scope="col">ID</th><th scope="col">Action</th><th scope="col">Task</th><th scope="col" className="timeline-heading">Timeline</th>{editing && <th scope="col"><span className="sr-only">Remove</span></th>}</tr></thead><tbody>
          {section.rows.map((row) => <tr key={row.id}>
            <td>{field("Task ID", row.code, (code) => changeRow(section.id, row.id, (entry) => ({ ...entry, code })))}</td>
            <td>{field("Task action", row.action, (action) => changeRow(section.id, row.id, (entry) => ({ ...entry, action })))}</td>
            <td>{field("Task description", row.description, (description) => changeRow(section.id, row.id, (entry) => ({ ...entry, description })))}</td>
            <td className="timeline-cell"><div className="timeline-entries">{row.timeline.map((entry) => <div className="timeline-entry" key={entry.id}>
              {field("Timeline label", entry.label, (label) => changeRow(section.id, row.id, (current) => ({ ...current, timeline: current.timeline.map((cell) => cell.id === entry.id ? { ...cell, label } : cell) })))}
              <div className="timeline-value">{field("Timeline value", entry.value, (value) => changeRow(section.id, row.id, (current) => ({ ...current, timeline: current.timeline.map((cell) => cell.id === entry.id ? { ...cell, value } : cell) })))}</div>
              {editing && <button className="text-button danger" aria-label="Remove timeline entry" onClick={() => changeRow(section.id, row.id, (current) => ({ ...current, timeline: current.timeline.filter((cell) => cell.id !== entry.id) }))}>Remove</button>}
            </div>)}
              {!editing && !row.timeline.length && <span className="not-set">No entries</span>}
              {editing && <button className="text-button" onClick={() => changeRow(section.id, row.id, (current) => ({ ...current, timeline: [...current.timeline, { id: crypto.randomUUID(), label: "", value: "" }] }))}>+ Entry</button>}
            </div></td>
            {editing && <td><button className="text-button danger" aria-label="Remove task row" onClick={() => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, rows: entry.rows.filter((task) => task.id !== row.id) } : entry) })}>Remove</button></td>}
          </tr>)}
        </tbody></table></div>
        {!section.rows.length && <p className="section-empty">No task rows yet.</p>}
        {editing && <button className="text-button add-row" onClick={() => change({ ...draft, sections: draft.sections.map((entry) => entry.id === section.id ? { ...entry, rows: [...entry.rows, { id: crypto.randomUUID(), code: "", action: "", description: "", timeline: [] }] } : entry) })}>+ Add task row</button>}
      </div>)}
      {!draft.sections.length && <p className="section-empty">{editing ? "Add a section to begin organizing tasks." : "No sections yet. Use Edit to create your own."}</p>}
      {editing && <button className="button subtle add-section" onClick={() => change({ ...draft, sections: [...draft.sections, { id: crypto.randomUUID(), name: "", rows: [] }] })}>+ Add section</button>}
    </fieldset>
  </section>;
}
