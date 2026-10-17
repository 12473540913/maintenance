import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "../../frontend/src/lib/authClient";

describe("email verification recovery", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("accepts a signup retry that sends verification for an existing unverified account", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      user: { email: "pending@example.test", emailVerified: false }
    })));
    await expect(authClient.signUp("pending@example.test", "OriginalPassword1")).resolves.toEqual({
      verificationCode: undefined
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/auth/signup", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-App-Id": "maintenance" },
      body: JSON.stringify({ email: "pending@example.test", password: "OriginalPassword1" })
    });
  });

  it("preserves the duplicate-email error for verified accounts without requesting a code", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      error: "Email already in use"
    }), { status: 409 }));
    await expect(authClient.signUp("verified@example.test", "OriginalPassword1")).rejects.toThrow("Email already in use");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requests a fresh code for an existing account without signing up or signing in", async () => {
    await authClient.resendSignUpCode("pending@example.test");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/auth/verify/request", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-App-Id": "maintenance" },
      body: JSON.stringify({ email: "pending@example.test" })
    });
  });

  it("confirms the replacement code for the same account", async () => {
    await authClient.resendSignUpCode("pending@example.test");
    await authClient.verifySignUp("pending@example.test", "fresh-code");
    expect(fetch).toHaveBeenLastCalledWith("/auth/verify/confirm", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-App-Id": "maintenance" },
      body: JSON.stringify({ email: "pending@example.test", code: "fresh-code" })
    });
  });

  it.each([
    ["resend", () => authClient.resendSignUpCode("pending@example.test"), "Please wait before requesting another code."],
    ["verify", () => authClient.verifySignUp("pending@example.test", "expired-code"), "Verification code expired."]
  ])("surfaces %s failures instead of reporting success", async (_action, request, error) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error }), { status: 400 }));
    await expect(request()).rejects.toThrow(error);
  });
});
