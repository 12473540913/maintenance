import type { Completion, DueInstance, Machine, Rule, TaskDefinition } from "@maintenance/shared";

const DAY = 24 * 60 * 60 * 1000;

export function calculateDueInstance(task: TaskDefinition, machine: Machine, rule: Rule, completion?: Completion, now = new Date()): DueInstance {
  const rawMiles = machine.currentOdometer;
  const parsedMiles = typeof rawMiles === "string" ? (rawMiles.trim() ? Number(rawMiles) : NaN) : rawMiles;
  const currentMiles = parsedMiles !== undefined && Number.isFinite(parsedMiles) && parsedMiles >= 0 ? parsedMiles : undefined;
  const anchorDate = completion?.completedAt ?? machine.inServiceDate;
  const anchorMiles = completion?.odometer ?? 0;
  const anchorTime = anchorDate ? new Date(anchorDate).getTime() : NaN;
  const dueDate = Number.isFinite(anchorTime) && rule.yearsInterval ? new Date(anchorTime + rule.yearsInterval * 365.25 * DAY) : undefined;
  const dueOdometer = anchorMiles !== undefined && rule.mileageInterval ? anchorMiles + rule.mileageInterval : undefined;
  const dateDue = dueDate ? dueDate.getTime() <= now.getTime() : false;
  const milesDue = dueOdometer !== undefined && currentMiles !== undefined ? currentMiles >= dueOdometer : false;
  const hasTrigger = dueDate !== undefined || dueOdometer !== undefined;
  const triggerIsDue = rule.kind === "mileage" ? milesDue : rule.kind === "age" ? dateDue : rule.kind === "either" ? dateDue || milesDue : false;
  const dates = [dueDate?.getTime(), dueOdometer !== undefined && currentMiles !== undefined ? now.getTime() + (dueOdometer - currentMiles) * DAY : undefined].filter((value): value is number => value !== undefined);
  const nearest = dates.length ? new Date(Math.min(...dates)) : undefined;
  const daysUntil = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / DAY) : undefined;
  const milesUntil = dueOdometer !== undefined && currentMiles !== undefined ? dueOdometer - currentMiles : undefined;
  const nearDue = (daysUntil !== undefined && daysUntil <= 30) || (milesUntil !== undefined && milesUntil <= 500);
  return {
    task, machine, rule,
    status: !hasTrigger ? "unscheduled" : triggerIsDue ? "overdue" : nearDue ? "due-soon" : "upcoming",
    dueDate: nearest?.toISOString(), dueOdometer, daysUntil, milesUntil
  };
}
