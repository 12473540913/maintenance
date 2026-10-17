import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("frontend request destinations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_AUTH_BASE_URL", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => []
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the mapped API and auth-service in production without build overrides", async () => {
    vi.stubEnv("DEV", false);
    const { api, authUrl } = await import("../../frontend/src/lib/api");
    await api.machines();
    expect(fetch).toHaveBeenCalledWith("https://api.maintenance.lnks.info/api/machines", { credentials: "include" });
    expect(authUrl("/auth/signup")).toBe("https://auth.lnks.info/auth/signup");
  });

  it("respects production build overrides", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test/api/");
    vi.stubEnv("VITE_AUTH_BASE_URL", "https://auth.example.test/");
    const { api, authUrl } = await import("../../frontend/src/lib/api");
    await api.machines();
    expect(fetch).toHaveBeenCalledWith("https://api.example.test/api/machines", { credentials: "include" });
    expect(authUrl("/auth/signin")).toBe("https://auth.example.test/auth/signin");
  });

  it("keeps development requests on the localhost proxy even with production overrides", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test/api");
    vi.stubEnv("VITE_AUTH_BASE_URL", "https://auth.example.test");
    const { api, authUrl } = await import("../../frontend/src/lib/api");
    await api.machines();
    expect(fetch).toHaveBeenCalledWith("/api/machines", { credentials: "include" });
    expect(authUrl("/auth/signup")).toBe("/auth/signup");
  });

  it("posts only machine IDs to the production reorder endpoint with credentials", async () => {
    vi.stubEnv("DEV", false);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ updated: 2 })));
    const { api } = await import("../../frontend/src/lib/api");
    const machineIds = ["0123456789abcdef01234567", "0123456789abcdef01234568"];
    await expect(api.reorderMachines(machineIds)).resolves.toEqual({ updated: 2 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://api.maintenance.lnks.info/api/machines/reorder", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineIds, shopId: "shop-1" })
    });
  });

  it.each([
    [404, "<!DOCTYPE html><html><body>Cannot POST /api/machines/reorder</body></html>", "text/html; charset=utf-8",
      "API endpoint not found (HTTP 404). The deployed API may be out of date."],
    [404, "", "text/plain",
      "API endpoint not found (HTTP 404). The deployed API may be out of date."],
    [502, "<html><body>Bad Gateway</body></html>", "text/html",
      "Request failed (HTTP 502)."],
    [503, "Service unavailable", "text/plain",
      "Service unavailable (HTTP 503)"],
    [409, JSON.stringify({ error: "Your machines changed while saving their order. Reload and try again." }), "application/json",
      "Your machines changed while saving their order. Reload and try again."],
    [404, JSON.stringify({ error: "Item not found." }), "application/json",
      "Item not found."]
  ])("surfaces a useful error for HTTP %s with body %s", async (status, body, contentType, message) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status, headers: { "Content-Type": contentType } }));
    const { api } = await import("../../frontend/src/lib/api");
    await expect(api.reorderMachines([])).rejects.toThrow(message);
  });
});
