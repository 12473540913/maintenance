import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnnualInspectionInstance, AnnualInspectionInstanceTask, AnnualInspectionSection, AnnualInspectionTask, Machine, TaskLedger } from "@maintenance/shared";
import { api } from "../lib/api";
import { moveAnnualInspectionTask } from "../lib/ledger";
import { itemName } from "./ShopView";

type ChecklistMode = "edit" | "instance" | "preview";
type InstanceValues = Record<string, AnnualInspectionInstanceTask>;

function createTask(sectionId?: string): AnnualInspectionTask {
  return { id: crypto.randomUUID(), description: "", ...(sectionId ? { sectionId } : {}) };
}

function coreTasks(ledger: TaskLedger): AnnualInspectionTask[] {
  return (ledger.annualInspectionTasks ?? []).map(({ id, description, sectionId }) => ({ id, description, sectionId }));
}

function coreSections(ledger: TaskLedger): AnnualInspectionSection[] {
  return (ledger.annualInspectionSections ?? []).map(({ id, name }) => ({ id, name }));
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
  const [sections, setSections] = useState(() => coreSections(ledger));
  const [instance, setInstance] = useState(() => savedInstance(ledger));
  const [mode, setMode] = useState<ChecklistMode>("preview");
  const [coreDirty, setCoreDirty] = useState(false);
  const [instanceDirty, setInstanceDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savedTasks = coreTasks(ledger);
  const savedSections = coreSections(ledger);

  useEffect(() => { dialog.current?.showModal(); }, []);

  const close = () => {
    if (saving) return;
    if ((coreDirty || instanceDirty) && !window.confirm("Discard unsaved annual inspection changes?")) return;
    onClose();
  };

  const persist = async (next: Pick<TaskLedger, "annualInspectionTasks" | "annualInspectionSections" | "annualInspectionInstance">, fallbackError: string) => {
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
    if (await persist({ annualInspectionTasks: tasks, annualInspectionSections: sections, annualInspectionInstance: toInstance(savedTasks, savedInstance(ledger)) }, "Could not save annual inspection tasks.")) setCoreDirty(false);
  };

  const saveInstance = async () => {
    if (await persist({ annualInspectionTasks: savedTasks, annualInspectionSections: savedSections, annualInspectionInstance: toInstance(savedTasks, instance) }, "Could not save inspection instance.")) setInstanceDirty(false);
  };

  const updateTask = (taskId: string, description: string) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, description } : task));
    setCoreDirty(true);
  };

  const updateSection = (sectionId: string, name: string) => {
    setSections((current) => current.map((section) => section.id === sectionId ? { ...section, name } : section));
    setCoreDirty(true);
  };

  const moveTask = (taskId: string, offset: -1 | 1) => {
    setTasks((current) => moveAnnualInspectionTask(current, sections, taskId, offset));
    setCoreDirty(true);
  };

  const updateInstance = (taskId: string, update: (task: AnnualInspectionInstanceTask) => AnnualInspectionInstanceTask) => {
    setInstance((current) => ({ ...current, [taskId]: update(current[taskId] ?? emptyInstanceTask(taskId)) }));
    setInstanceDirty(true);
  };

  const editing = mode === "edit";
  const instanceMode = mode === "instance";
  const previewing = mode === "preview";
  const visibleTasks = instanceMode ? savedTasks : tasks;
  const visibleSections = instanceMode ? savedSections : sections;
  const sectionIds = new Set(visibleSections.map((section) => section.id));
  const taskGroups = [
    {
      id: "unsectioned",
      section: undefined,
      tasks: visibleTasks.filter((task) => !task.sectionId || !sectionIds.has(task.sectionId))
    },
    ...visibleSections.map((section) => ({
      id: section.id,
      section,
      tasks: visibleTasks.filter((task) => task.sectionId === section.id)
    }))
  ].filter((group) => group.tasks.length > 0 || group.section);
  const taskNumbers = new Map(taskGroups.flatMap((group) => group.tasks).map((task, index) => [task.id, index + 1]));

  return createPortal(<dialog ref={dialog} className="annual-inspection-dialog" aria-labelledby="annual-inspection-title" onCancel={(event) => {
    event.preventDefault();
    close();
  }}>
    <div className="annual-inspection-header">
      <div className="annual-inspection-header-actions">
        <div className="annual-inspection-mode-actions">
          {!instanceMode
            ? <button type="button" className="button subtle" disabled={coreDirty} title={coreDirty ? "Save checklist changes before opening the instance" : undefined} onClick={() => setMode("instance")}>Instance</button>
            : <>
              <button type="button" className="button primary" disabled={!instanceDirty || saving} onClick={() => void saveInstance()}>{saving ? "Saving..." : "Save"}</button>
              <button type="button" className="button subtle" disabled={saving} onClick={() => {
                if (!window.confirm("Clear all notes and checkmarks for this inspection instance?")) return;
                setInstance({});
                setInstanceDirty(true);
              }}>Clear</button>
              <button type="button" className="button subtle" onClick={() => window.print()}>Print</button>
              <button type="button" className="button subtle" disabled={saving} onClick={() => setMode("preview")}>Exit</button>
            </>}
        </div>
        <div className="annual-inspection-view-actions">
          {editing && <button type="button" className="button primary" disabled={!coreDirty || saving} onClick={() => void saveCore()}>{saving ? "Saving..." : "Save"}</button>}
          <button type="button" className="button subtle" onClick={() => setMode(editing ? "preview" : "edit")}>{editing ? "Preview" : "Edit"}</button>
          <button type="button" className="icon-button" onClick={close} disabled={saving} aria-label="Close annual inspection checklist">×</button>
        </div>
      </div>
      <h2 id="annual-inspection-title">{itemName(machine)} - Annual Inspection Checklist</h2>
    </div>

    {error && <div className="alert" role="alert">{error}</div>}
    <div className="annual-inspection-content">
      {!visibleTasks.length && <p className="annual-inspection-empty">No annual inspection tasks yet.</p>}
      {taskGroups.map(({ id, section, tasks: groupTasks }) => <section className="annual-inspection-group" key={id}>
        {section && (editing
          ? <div className="annual-inspection-section-edit">
            <input aria-label="Section title" type="text" value={section.name} onChange={(event) => updateSection(section.id, event.target.value)} disabled={saving} />
            <button type="button" className="annual-inspection-remove" aria-label={`Remove section ${section.name || "title"}`} title="Remove section" onClick={() => {
              setSections((current) => current.filter((entry) => entry.id !== section.id));
              setTasks((current) => current.map((task) => {
                if (task.sectionId !== section.id) return task;
                const { sectionId: _sectionId, ...taskWithoutSection } = task;
                return taskWithoutSection;
              }));
              setCoreDirty(true);
            }} disabled={saving}>×</button>
          </div>
          : <h3 className="annual-inspection-section-title">{section.name || <span className="not-set">Section title</span>}</h3>)}
        <ol className={`annual-inspection-list${previewing ? " task-preview-list" : ""}`}>
          {groupTasks.map((task) => {
            const taskNumber = taskNumbers.get(task.id) ?? 0;
            const groupIndex = taskGroups.findIndex((group) => group.tasks.some((entry) => entry.id === task.id));
            const taskIndex = groupTasks.findIndex((entry) => entry.id === task.id);
            const canMoveUp = taskIndex > 0 || groupIndex > 0;
            const canMoveDown = taskIndex < groupTasks.length - 1 || groupIndex < taskGroups.length - 1;
            const values = instance[task.id] ?? emptyInstanceTask(task.id);
            return <li className="annual-inspection-task" key={task.id}>
            <span className="annual-inspection-number" aria-hidden="true">{taskNumber}.</span>
            <div className="annual-inspection-task-content">
              {editing
                ? <div className="annual-inspection-description-input">
                  <input aria-label="Task description" type="text" value={task.description} onChange={(event) => updateTask(task.id, event.target.value)} disabled={saving} />
                  <div className="annual-inspection-task-actions">
                    <button type="button" className="annual-inspection-remove" aria-label={`Remove task ${taskNumber}`} title="Remove task" onClick={() => {
                      setTasks((current) => current.filter((entry) => entry.id !== task.id));
                      setCoreDirty(true);
                    }} disabled={saving}>×</button>
                    <button type="button" className="text-button task-row-move" aria-label={`Move task ${taskNumber} up`} title="Move task up" disabled={!canMoveUp || saving} onClick={() => moveTask(task.id, -1)}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 7.5 4-4 4 4" /></svg></button>
                    <button type="button" className="text-button task-row-move" aria-label={`Move task ${taskNumber} down`} title="Move task down" disabled={!canMoveDown || saving} onClick={() => moveTask(task.id, 1)}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4.5 4 4 4-4" /></svg></button>
                  </div>
                </div>
                : <span className="annual-inspection-description">{task.description || <span className="not-set">Task description</span>}</span>}
              {instanceMode && <div className="annual-inspection-notes">
                {(["clientNotes", "inspectionNotes"] as const).map((key) => {
                  const label = key === "clientNotes" ? "Client notes" : "Inspection notes";
                  return <label className="annual-inspection-note" key={key}>
                    <span>{label}</span>
                    <input type="text" aria-label={label} value={values[key]} onChange={(event) => updateInstance(task.id, (current) => ({ ...current, [key]: event.target.value }))} disabled={saving} />
                  </label>;
                })}
              </div>}
            </div>
            {!editing && <input
              className="annual-inspection-checkbox"
              type="checkbox"
              aria-label={`Task ${taskNumber} complete`}
              checked={previewing ? false : values.checked}
              disabled={!instanceMode || saving}
              onChange={(event) => updateInstance(task.id, (current) => ({ ...current, checked: event.target.checked }))}
            />}
            </li>;
          })}
        </ol>
      </section>)}
      {editing && <button type="button" className="button subtle annual-inspection-add" onClick={() => {
        setTasks((current) => [...current, createTask(sections[sections.length - 1]?.id)]);
        setCoreDirty(true);
      }} disabled={saving}>+ Add task</button>}
      {editing && <button type="button" className="button subtle annual-inspection-add-section" onClick={() => {
        setSections((current) => [...current, { id: crypto.randomUUID(), name: "New section" }]);
        setCoreDirty(true);
      }} disabled={saving}>+ Add section</button>}
    </div>
  </dialog>, document.body);
}
