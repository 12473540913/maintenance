import type { Completion, TaskDefinition, TaskLedger } from "@maintenance/shared";

export type TimelineColor = "red" | "green" | "orange" | "blue";

export function moveLedgerSection(ledger: TaskLedger, sectionId: string, offset: -1 | 1): TaskLedger {
  const index = ledger.sections.findIndex((section) => section.id === sectionId);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= ledger.sections.length) return ledger;
  const sections = [...ledger.sections];
  [sections[index], sections[targetIndex]] = [sections[targetIndex], sections[index]];
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
