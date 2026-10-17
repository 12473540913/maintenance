import type { Completion, DueInstance, Machine, Profile, Rule, ShopSetting, TaskDefinition, TaskLedger, ValidationValue } from "@maintenance/shared";

const apiBaseUrl = import.meta.env.DEV ? "/api" : normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL) || "https://api.maintenance.lnks.info/api";
const authBaseUrl = import.meta.env.DEV ? "" : normalizeApiBase(import.meta.env.VITE_AUTH_BASE_URL) || "https://auth.lnks.info";

function normalizeApiBase(rawValue: string | undefined): string {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (typeof window !== "undefined" && window.location.protocol === "https:" && /^http:\/\//i.test(withScheme) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(withScheme)) {
    return withScheme.replace(/^http:\/\//i, "https://").replace(/\/+$/, "");
  }
  return withScheme.replace(/\/+$/, "");
}

export function authUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${authBaseUrl}${normalizedPath}`;
}

async function parseError(response: Response): Promise<Error> {
  const body = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  if (payload && typeof payload === "object" && "error" in payload) {
    return new Error(String(payload.error));
  }
  if (body.trim() && !response.headers.get("content-type")?.includes("text/html") && !body.trimStart().startsWith("<")) {
    return new Error(`${body} (HTTP ${response.status})`);
  }
  return new Error(response.status === 404
    ? "API endpoint not found (HTTP 404). The deployed API may be out of date."
    : `Request failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`);
}

async function get<T>(path: string): Promise<T> { const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include" }); if (!response.ok) throw await parseError(response); return response.json(); }
async function post<T>(path: string, body: unknown): Promise<T> { const response = await fetch(`${apiBaseUrl}${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw await parseError(response); return response.json(); }
async function remove(path: string): Promise<void> { const response = await fetch(`${apiBaseUrl}${path}`, { method: "DELETE", credentials: "include" }); if (!response.ok) throw await parseError(response); }
async function put<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw await parseError(response);
  return response.json();
}
export const api = {
  tasks: () => get<TaskDefinition[]>("/taskDefinitions"),
  completions: () => get<Completion[]>("/completions"),
  ledgers: () => get<TaskLedger[]>("/task-ledgers"),
  saveLedger: (ledger: TaskLedger) => put<TaskLedger>(`/task-ledgers/${encodeURIComponent(ledger.machineId)}`, ledger),
  profile: () => get<Profile>("/profile"),
  saveProfile: (profile: Profile) => put<Profile>("/profile", profile),
  shops: () => get<ShopSetting[]>("/shops"),
  saveShops: (shops: ShopSetting[]) => put<ShopSetting[]>("/shops", shops),
  dashboard: () => get<DueInstance[]>("/dashboard"),
  machines: () => get<Machine[]>("/machines"),
  rules: () => get<Rule[]>("/rules"),
  validationValues: () => get<ValidationValue[]>("/validation-values"),
  createValidationValue: (value: Omit<ValidationValue, "id" | "core">) => post<ValidationValue>("/validation-values", value),
  deleteValidationValue: (id: string) => remove(`/validation-values/${id}`),
  createMachine: (machine: Omit<Machine, "id">) => post<Machine>("/machines", machine),
  updateMachine: (id: string, machine: Omit<Machine, "id">) => put<Machine>(`/machines/${encodeURIComponent(id)}`, machine),
  archiveMachine: (id: string) => remove(`/machines/${encodeURIComponent(id)}/archive`),
  deleteMachine: (id: string) => remove(`/machines/${encodeURIComponent(id)}`),
  reorderMachines: (machineIds: string[], shopId = "shop-1") => post<{ updated: number }>("/machines/reorder", { machineIds, shopId }),
  updateOdometer: (id: string, currentOdometer: number, currentOdometerDate: string) => fetch(`${apiBaseUrl}/machines/${id}/odometer`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentOdometer, currentOdometerDate }) })
};
