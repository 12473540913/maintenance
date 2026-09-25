import type { DueInstance, Machine, Rule, ValidationValue } from "@maintenance/shared";

const apiBaseUrl = normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL) || "/api";
const authBaseUrl = import.meta.env.DEV ? "" : normalizeApiBase(import.meta.env.VITE_AUTH_BASE_URL);

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
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload) {
    return new Error(String(payload.error));
  }
  return new Error(await response.text().catch(() => "Request failed."));
}

async function get<T>(path: string): Promise<T> { const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include" }); if (!response.ok) throw await parseError(response); return response.json(); }
async function post<T>(path: string, body: unknown): Promise<T> { const response = await fetch(`${apiBaseUrl}${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw await parseError(response); return response.json(); }
async function remove(path: string): Promise<void> { const response = await fetch(`${apiBaseUrl}${path}`, { method: "DELETE", credentials: "include" }); if (!response.ok) throw await parseError(response); }
export const api = {
  dashboard: () => get<DueInstance[]>("/dashboard"),
  machines: () => get<Machine[]>("/machines"),
  rules: () => get<Rule[]>("/rules"),
  validationValues: () => get<ValidationValue[]>("/validation-values"),
  createValidationValue: (value: Omit<ValidationValue, "id" | "core">) => post<ValidationValue>("/validation-values", value),
  deleteValidationValue: (id: string) => remove(`/validation-values/${id}`),
  createMachine: (machine: Omit<Machine, "id">) => post<Machine>("/machines", machine),
  updateOdometer: (id: string, currentOdometer: number, currentOdometerDate: string) => fetch(`${apiBaseUrl}/machines/${id}/odometer`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentOdometer, currentOdometerDate }) })
};
