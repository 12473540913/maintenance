import type { Completion, TaskDefinition, TaskLedger } from "@maintenance/shared";

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
