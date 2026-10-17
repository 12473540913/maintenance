import { useEffect, useRef, useState } from "react";
import type { AnnualInspectionInstance, AnnualInspectionInstanceTask, AnnualInspectionTask, Machine, TaskLedger } from "@maintenance/shared";
import { api } from "../lib/api";
import { itemName } from "./ShopView";

type ChecklistMode = "edit" | "instance" | "preview" | "print-preview";
type InstanceValues = Record<string, AnnualInspectionInstanceTask>;

function createTask(): AnnualInspectionTask {
  return { id: crypto.randomUUID(), description: "" };
}

function coreTasks(ledger: TaskLedger): AnnualInspectionTask[] {
  return (ledger.annualInspectionTasks ?? []).map(({ id, description }) => ({ id, description }));
}

function emptyInstanceTask(taskId: string): AnnualInspectionInstanceTask {
  return { taskId, clientNotes: "", inspectionNotes: "", checked: false };
}

function savedInstance(ledger: TaskLedger): InstanceValues {
  const tasks = ledger.annualInspectionInstance?.tasks ?? (ledger.annualInspectionTasks ?? []).map((task) => ({
    taskId: task.id,
    clientNotes: task.clientNotes ?? "",
    inspectionNotes: task.inspectionNotes ?? "",
    checked: task.checked ?? false
  }));
  return Object.fromEntries(tasks.map((task) => [task.taskId, task]));
}

function toInstance(tasks: AnnualInspectionTask[], values: InstanceValues): AnnualInspectionInstance {
  return { tasks: tasks.map((task) => values[task.id] ?? emptyInstanceTask(task.id)) };
}

export function AnnualInspectionDialog({ machine, ledger, onClose, onSaved }: {
  machine: Machine;
  ledger: TaskLedger;
  onClose: () => void;
  onSaved: (ledger: TaskLedger) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tasks, setTasks] = useState(() => coreTasks(ledger));
  const [instance, setInstance] = useState(() => savedInstance(ledger));
  const [mode, setMode] = useState<ChecklistMode>("preview");
  const [coreDirty, setCoreDirty] = useState(false);
  const [instanceDirty, setInstanceDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savedTasks = coreTasks(ledger);

  useEffect(() => { dialog.current?.showModal(); }, []);

  const close = () => {
    if (saving) return;
    if ((coreDirty || instanceDirty) && !window.confirm("Discard unsaved annual inspection changes?")) return;
    onClose();
  };

  const persist = async (next: Pick<TaskLedger, "annualInspectionTasks" | "annualInspectionInstance">, fallbackError: string) => {
    setSaving(true);
    setError("");
    try {
      onSaved(await api.saveLedger({ ...ledger, ...next }));
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallbackError);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveCore = async () => {
    if (await persist({ annualInspectionTasks: tasks, annualInspectionInstance: toInstance(savedTasks, savedInstance(ledger)) }, "Could not save annual inspection tasks.")) setCoreDirty(false);
  };

  const saveInstance = async () => {
    if (await persist({ annualInspectionTasks: savedTasks, annualInspectionInstance: toInstance(savedTasks, instance) }, "Could not save inspection instance.")) setInstanceDirty(false);
  };

  const updateTask = (taskId: string, description: string) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, description } : task));
    setCoreDirty(true);
  };

  const updateInstance = (taskId: string, update: (task: AnnualInspectionInstanceTask) => AnnualInspectionInstanceTask) => {
    setInstance((current) => ({ ...current, [taskId]: update(current[taskId] ?? emptyInstanceTask(taskId)) }));
    setInstanceDirty(true);
  };

  const editing = mode === "edit";
  const instanceMode = mode === "instance";
  const previewing = mode === "preview";
  const printPreview = mode === "print-preview";
  const visibleTasks = instanceMode || printPreview ? savedTasks : tasks;

  return <dialog ref={dialog} className="annual-inspection-dialog" aria-labelledby="annual-inspection-title" onCancel={(event) => {
    event.preventDefault();
    close();
  }}>
    <div className="annual-inspection-header">
      <div className="annual-inspection-header-actions">
        <div className="annual-inspection-mode-actions">
          {printPreview
            ? <button type="button" className="button subtle" onClick={() => setMode("instance")}>Back to instance</button>
            : !instanceMode
              ? <button type="button" className="button subtle" disabled={coreDirty} title={coreDirty ? "Save checklist changes before opening the instance" : undefined} onClick={() => setMode("instance")}>Instance</button>
              : <>
                <button type="button" className="button primary" disabled={!instanceDirty || saving} onClick={() => void saveInstance()}>{saving ? "Saving..." : "Save"}</button>
                <button type="button" className="button subtle" disabled={saving} onClick={() => {
                  if (!window.confirm("Clear all notes and checkmarks for this inspection instance?")) return;
                  setInstance({});
                  setInstanceDirty(true);
                }}>Clear</button>
                <button type="button" className="button subtle" onClick={() => setMode("print-preview")}>Print Preview</button>
                <button type="button" className="button subtle" disabled title="Printing is not available yet">Print</button>
                <button type="button" className="button subtle" disabled={saving} onClick={() => setMode("preview")}>Exit</button>
              </>}
        </div>
        <div className="annual-inspection-view-actions">
          {editing && <button type="button" className="button primary" disabled={!coreDirty || saving} onClick={() => void saveCore()}>{saving ? "Saving..." : "Save"}</button>}
          {!printPreview && <button type="button" className="button subtle" onClick={() => setMode(editing ? "preview" : "edit")}>{editing ? "Preview" : "Edit"}</button>}
          <button type="button" className="icon-button" onClick={close} disabled={saving} aria-label="Close annual inspection checklist">×</button>
        </div>
      </div>
      <h2 id="annual-inspection-title">{itemName(machine)} - Annual Inspection Checklist</h2>
    </div>

    {error && <div className="alert" role="alert">{error}</div>}
    <div className={`annual-inspection-content${printPreview ? " is-print-preview" : ""}`}>
      {!visibleTasks.length && <p className="annual-inspection-empty">No annual inspection tasks yet.</p>}
      <ol className={`annual-inspection-list${previewing ? " task-preview-list" : ""}${printPreview ? " print-preview-list" : ""}`}>
        {visibleTasks.map((task, taskIndex) => {
          const values = instance[task.id] ?? emptyInstanceTask(task.id);
          return <li className="annual-inspection-task" key={task.id}>
            <span className="annual-inspection-number" aria-hidden="true" />
            <div className="annual-inspection-task-content">
              {editing
                ? <div className="annual-inspection-description-input">
                  <input aria-label="Task description" type="text" value={task.description} onChange={(event) => updateTask(task.id, event.target.value)} disabled={saving} />
                  <button type="button" className="annual-inspection-remove" aria-label={`Remove task ${taskIndex + 1}`} title="Remove task" onClick={() => {
                    setTasks((current) => current.filter((entry) => entry.id !== task.id));
                    setCoreDirty(true);
                  }} disabled={saving}>×</button>
                </div>
                : <span className="annual-inspection-description">{task.description || <span className="not-set">Task description</span>}</span>}
              {(instanceMode || printPreview) && <div className="annual-inspection-notes">
                {(["clientNotes", "inspectionNotes"] as const).map((key) => {
                  const label = key === "clientNotes" ? "Client notes" : "Inspection notes";
                  return <label className="annual-inspection-note" key={key}>
                    <span>{label}</span>
                    {printPreview
                      ? <div className="annual-inspection-note-preview">{values[key]}</div>
                      : <input type="text" aria-label={label} value={values[key]} onChange={(event) => updateInstance(task.id, (current) => ({ ...current, [key]: event.target.value }))} disabled={saving} />}
                  </label>;
                })}
              </div>}
            </div>
            {!editing && <input
              className="annual-inspection-checkbox"
              type="checkbox"
              aria-label={`Task ${taskIndex + 1} complete`}
              checked={previewing ? false : values.checked}
              disabled={!instanceMode || saving}
              onChange={(event) => updateInstance(task.id, (current) => ({ ...current, checked: event.target.checked }))}
            />}
          </li>;
        })}
      </ol>
      {editing && <button type="button" className="button subtle annual-inspection-add" onClick={() => {
        setTasks((current) => [...current, createTask()]);
        setCoreDirty(true);
      }} disabled={saving}>+ Add task</button>}
    </div>
  </dialog>;
}
