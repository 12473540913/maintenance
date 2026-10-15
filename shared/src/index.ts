import { z } from "zod";

export const MachineSchema = z.object({
  id: z.string().optional(),
  code: z.string(),
  type: z.string(),
  name: z.string().optional(),
  imageUrl: z.string().optional(),
  year: z.union([z.string(), z.number().int().min(1800).max(3000)]).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  spec1: z.string().optional(),
  spec2: z.string().optional(),
  acquiredDate: z.string().optional(),
  inServiceDate: z.string().optional(),
  currentOdometer: z.union([z.string(), z.number().nonnegative()]).optional(),
  currentOdometerDate: z.string().optional(),
  status: z.string().default("Active"),
  vinOrSerial: z.string().optional(),
  modelId: z.string().optional(),
  licenseId: z.string().optional(),
  reminderMiles: z.union([z.string(), z.number().nonnegative()]).optional(),
  reminderYears: z.union([z.string(), z.number().nonnegative()]).optional()
});

export const LedgerRowSchema = z.object({
  id: z.string().min(1),
  code: z.string(),
  action: z.string(),
  description: z.string(),
  timeline: z.array(z.object({ id: z.string().min(1), label: z.string(), value: z.string() }))
});

export const TaskLedgerSchema = z.object({
  machineId: z.string().min(1),
  sections: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    rows: z.array(LedgerRowSchema)
  }))
});

export const ProfileSchema = z.object({ username: z.string().trim().min(3).max(100) });
export type TaskLedger = z.infer<typeof TaskLedgerSchema>;
export type LedgerSection = TaskLedger["sections"][number];
export type LedgerRow = z.infer<typeof LedgerRowSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

export const ValidationCategorySchema = z.enum(["type", "make", "model", "spec1", "status"]);

export const ValidationValueSchema = z.object({
  id: z.string().optional(),
  category: ValidationCategorySchema,
  value: z.string().trim().min(1),
  core: z.boolean().default(false)
});

export const RuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  kind: z.enum(["mileage", "age", "either", "special"]),
  mileageInterval: z.number().positive().optional(),
  yearsInterval: z.number().positive().optional(),
  description: z.string().optional()
});

export const TaskDefinitionSchema = z.object({
  id: z.string().optional(),
  machineId: z.string(),
  name: z.string().min(1),
  category: z.string().default("General"),
  ruleId: z.string(),
  notes: z.string().optional()
});

export const CompletionSchema = z.object({
  id: z.string().optional(),
  taskDefinitionId: z.string(),
  completedAt: z.string(),
  odometer: z.number().nonnegative().optional(),
  note: z.string().optional()
});

export type Machine = z.infer<typeof MachineSchema>;
export type ValidationCategory = z.infer<typeof ValidationCategorySchema>;
export type ValidationValue = z.infer<typeof ValidationValueSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;
export type Completion = z.infer<typeof CompletionSchema>;
export type DueStatus = "overdue" | "due-soon" | "upcoming" | "unscheduled";
export type DueInstance = {
  task: TaskDefinition;
  machine: Machine;
  rule: Rule;
  status: DueStatus;
  dueDate?: string;
  dueOdometer?: number;
  daysUntil?: number;
  milesUntil?: number;
};
