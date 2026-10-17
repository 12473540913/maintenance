import type { AnnualInspectionSection, AnnualInspectionTask, Completion, TaskDefinition, TaskLedger } from "@maintenance/shared";

export type TimelineColor = "red" | "green" | "orange" | "blue";

export function moveAnnualInspectionTask(
  tasks: AnnualInspectionTask[],
  sections: AnnualInspectionSection[],
  taskId: string,
  offset: -1 | 1
): AnnualInspectionTask[] {
  const sectionIds = new Set(sections.map((section) => section.id));
  const unsectionedTasks = tasks.filter((task) => !task.sectionId || !sectionIds.has(task.sectionId));
  const groups = [
    ...(unsectionedTasks.length ? [{ sectionId: undefined, tasks: unsectionedTasks }] : []),
    ...sections.map((section) => ({ sectionId: section.id, tasks: tasks.filter((task) => task.sectionId === section.id) }))
  ];
  const groupIndex = groups.findIndex((group) => group.tasks.some((task) => task.id === taskId));
  if (groupIndex < 0) return tasks;
  const group = groups[groupIndex];
  const taskIndex = group.tasks.findIndex((task) => task.id === taskId);
  const target = group.tasks[taskIndex + offset];
  const nextTasks = [...tasks];

  if (target) {
    const sourceIndex = nextTasks.findIndex((entry) => entry.id === taskId);
    const targetIndex = nextTasks.findIndex((entry) => entry.id === target.id);
    [nextTasks[sourceIndex], nextTasks[targetIndex]] = [nextTasks[targetIndex], nextTasks[sourceIndex]];
    return nextTasks;
  }

  const targetGroup = groups[groupIndex + offset];
  if (!targetGroup) return tasks;
  const task = group.tasks[taskIndex];
  const movedTask: AnnualInspectionTask = { ...task, sectionId: targetGroup.sectionId };
  if (!targetGroup.sectionId) delete movedTask.sectionId;
  nextTasks.splice(nextTasks.findIndex((entry) => entry.id === taskId), 1);
  const anchor = offset === -1 ? targetGroup.tasks[targetGroup.tasks.length - 1] : targetGroup.tasks[0];
  const anchorIndex = anchor ? nextTasks.findIndex((entry) => entry.id === anchor.id) + (offset === -1 ? 1 : 0) : nextTasks.length;
  nextTasks.splice(anchorIndex, 0, movedTask);
  return nextTasks;
}

export function moveLedgerSection(ledger: TaskLedger, sectionId: string, offset: -1 | 1): TaskLedger {
  const index = ledger.sections.findIndex((section) => section.id === sectionId);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= ledger.sections.length) return ledger;
  const sections = [...ledger.sections];
  [sections[index], sections[targetIndex]] = [sections[targetIndex], sections[index]];
  return { ...ledger, sections };
}

export function moveLedgerRow(ledger: TaskLedger, sectionId: string, rowId: string, offset: -1 | 1): TaskLedger {
  const sectionIndex = ledger.sections.findIndex((section) => section.id === sectionId);
  if (sectionIndex < 0) return ledger;
  const section = ledger.sections[sectionIndex];
  const rowIndex = section.rows.findIndex((row) => row.id === rowId);
  if (rowIndex < 0) return ledger;
  const targetIndex = rowIndex + offset;
  const sections = [...ledger.sections];
  const rows = [...section.rows];
  if (targetIndex >= 0 && targetIndex < rows.length) {
    [rows[rowIndex], rows[targetIndex]] = [rows[targetIndex], rows[rowIndex]];
  } else {
    const targetSectionIndex = sectionIndex + offset;
    if (targetSectionIndex < 0 || targetSectionIndex >= sections.length) return ledger;
    const targetSection = sections[targetSectionIndex];
    const [row] = rows.splice(rowIndex, 1);
    sections[targetSectionIndex] = {
      ...targetSection,
      rows: offset === -1 ? [...targetSection.rows, row] : [row, ...targetSection.rows]
    };
  }
  sections[sectionIndex] = { ...section, rows };
  return { ...ledger, sections };
}

export function timelineColor(entry: TaskLedger["sections"][number]["rows"][number]["timeline"][number]): TimelineColor | undefined {
  if (entry.color) return entry.color;
  const label = entry.label.trim().toLowerCase();
  if (label === "red" || label === "green" || label === "orange" || label === "blue") return label;
  return label ? "green" : undefined;
}

export function timelineLabel(entry: TaskLedger["sections"][number]["rows"][number]["timeline"][number]): string {
  return entry.label.trim().toLowerCase() === timelineColor(entry) ? "" : entry.label;
}

export function setTimelineColor(
  entry: TaskLedger["sections"][number]["rows"][number]["timeline"][number],
  nextColor: TimelineColor | ""
) {
  const currentColor = timelineColor(entry);
  const label = timelineLabel(entry);
  return {
    ...entry,
    color: nextColor || undefined,
    label: nextColor === "green" ? (currentColor === "green" ? label || "green" : "green") : nextColor
  };
}

export function initialLedger(machineId: string, saved: TaskLedger[], tasks: TaskDefinition[], completions: Completion[] = []): TaskLedger {
  const existing = saved.find((ledger) => ledger.machineId === machineId);
  if (existing) return existing;
  const sections: TaskLedger["sections"] = [];
  for (const task of tasks.filter((task) => task.machineId === machineId)) {
    const name = task.category || "General";
    let section = sections.find((section) => section.name === name);
    if (!section) {
      section = { id: `legacy-section-${sections.length}`, name, rows: [] };
      sections.push(section);
    }
    section.rows.push({
      id: task.id || `legacy-task-${sections.length}-${section.rows.length}`,
      code: "", action: "", description: [task.name, task.notes].filter(Boolean).join(" — "),
      timeline: completions.filter((completion) => completion.taskDefinitionId === task.id).map((completion, index) => ({
        id: completion.id || `legacy-completion-${index}`,
        label: [completion.odometer !== undefined ? `${completion.odometer} mi` : "", completion.completedAt].filter(Boolean).join(" / "),
        value: completion.note || "Completed"
      }))
    });
  }
  return { machineId, sections };
}
