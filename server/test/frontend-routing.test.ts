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
});
