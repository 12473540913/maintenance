import { z } from "zod";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const MachineImageSchema = z.string()
  .max(4 * Math.ceil(MAX_IMAGE_BYTES / 3) + 32, "Image must be 5 MB or smaller.")
  .regex(/^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Choose a JPEG, PNG, GIF, or WebP image.")
  .refine((value) => {
    const data = value.slice(value.indexOf(",") + 1);
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    const bytes = data.length * 3 / 4 - padding;
    return data.length % 4 === 0 && bytes > 0 && bytes <= MAX_IMAGE_BYTES;
  }, "Image must be nonempty and 5 MB or smaller.");

export const ImageCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoom: z.number().min(1).max(3)
});
export type ImageCrop = z.infer<typeof ImageCropSchema>;

export const MachineSchema = z.object({
  id: z.string().optional(),
  shopId: z.string().regex(/^shop-\d+$/).optional(),
  code: z.string(),
  type: z.string(),
  name: z.string().optional(),
  shopOrder: z.number().int().nonnegative().optional(),
  archived: z.boolean().optional(),
  imageUrl: z.string().optional(),
  imageData: z.union([MachineImageSchema, z.literal("")]).optional(),
  imageCrop: ImageCropSchema.optional(),
  year: z.union([z.string(), z.number().int().min(1800).max(3000)]).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  spec1: z.string().optional(),
  spec2: z.string().optional(),
  acquiredDate: z.string().optional(),
  inServiceDate: z.string().optional(),
  currentOdometer: z.union([z.string(), z.number().nonnegative()]).optional(),
  currentOdometerDate: z.string().optional(),
  status: z.string().optional(),
  vinOrSerial: z.string().optional(),
  modelId: z.string().optional(),
  licenseId: z.string().optional(),
  reminderMiles: z.union([z.string(), z.number().nonnegative()]).optional(),
  reminderYears: z.union([z.string(), z.number().nonnegative()]).optional()
});
export const ShopSettingSchema = z.object({
  id: z.string().regex(/^shop-\d+$/),
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean()
});
export const ShopSettingsSchema = z.array(ShopSettingSchema)
  .min(1)
  .refine((shops) => new Set(shops.map(({ id }) => id)).size === shops.length, "Shop IDs must be unique.")
  .refine((shops) => shops.some(({ enabled }) => enabled), "At least one shop must be enabled.");

export const LedgerRowSchema = z.object({
  id: z.string().min(1),
  code: z.string(),
  action: z.string(),
  description: z.string(),
  timeline: z.array(z.object({
    id: z.string().min(1),
    label: z.string(),
    value: z.string(),
    color: z.enum(["red", "green", "orange", "blue"]).optional()
  }))
});

export const AnnualInspectionTaskSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  sectionId: z.string().min(1).optional(),
  // Legacy instance fields from before instances were stored separately.
  clientNotes: z.string().optional(),
  inspectionNotes: z.string().optional(),
  checked: z.boolean().optional()
});

export const AnnualInspectionSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string()
});

export const AnnualInspectionInstanceTaskSchema = z.object({
  taskId: z.string().min(1),
  clientNotes: z.string(),
  inspectionNotes: z.string(),
  checked: z.boolean()
});

export const AnnualInspectionInstanceSchema = z.object({
  tasks: z.array(AnnualInspectionInstanceTaskSchema)
});

export const TaskLedgerSchema = z.object({
  machineId: z.string().min(1),
  sections: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    rows: z.array(LedgerRowSchema)
  })),
  annualInspectionTasks: z.array(AnnualInspectionTaskSchema).optional(),
  annualInspectionSections: z.array(AnnualInspectionSectionSchema).optional(),
  annualInspectionInstance: AnnualInspectionInstanceSchema.optional()
});
export const ProfileSchema = z.object({ username: z.string().trim().min(3).max(100) });
export type TaskLedger = z.infer<typeof TaskLedgerSchema>;
export type AnnualInspectionTask = z.infer<typeof AnnualInspectionTaskSchema>;
export type AnnualInspectionSection = z.infer<typeof AnnualInspectionSectionSchema>;
export type AnnualInspectionInstance = z.infer<typeof AnnualInspectionInstanceSchema>;
export type AnnualInspectionInstanceTask = z.infer<typeof AnnualInspectionInstanceTaskSchema>;
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
export type ShopSetting = z.infer<typeof ShopSettingSchema>;
export function shopName(shop: Pick<ShopSetting, "id" | "name">): string {
  return shop.name?.trim() || `Shop ${Number(shop.id.slice("shop-".length))}`;
}
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
