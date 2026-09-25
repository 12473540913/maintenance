import { authUrl } from "./api";

const APP_ID = "maintenance";
const AUTH_EVENT = "maintenance-auth-changed";
const TAB_SESSION_KEY = "maintenance-authenticated-in-tab";

export type AppAuthSession = {
  authenticated: true;
  userId: string;
  email: string;
  username: string | null;
  emailVerified: boolean;
  birthDate?: string | null;
  profilePhotoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SignUpResult = {
  verificationCode?: string;
};

export type CodeResult = {
  verificationCode?: string;
  resetCode?: string;
};

function hasTabSession(): boolean {
  try {
    return window.sessionStorage.getItem(TAB_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

function setTabSession(active: boolean): void {
  try {
    if (active) {
      window.sessionStorage.setItem(TAB_SESSION_KEY, "true");
    } else {
      window.sessionStorage.removeItem(TAB_SESSION_KEY);
    }
  } catch {
  }
}

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function normalizeError(payload: unknown, fallback: string): Error {
  const value = payload as { error?: unknown; message?: unknown };
  return new Error(String(value?.error ?? value?.message ?? fallback));
}

async function fetchAuth(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(authUrl(`/auth${path}`), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": APP_ID,
      ...(init.headers ?? {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw normalizeError(payload, "Authentication request failed.");
  }

  return payload;
}

export const authClient = {
  eventName: AUTH_EVENT,

  async getSession(): Promise<AppAuthSession | null> {
    if (!hasTabSession()) return null;

    try {
      const response = await fetch(authUrl("/auth/session"), {
        method: "GET",
        credentials: "include",
        headers: { "X-App-Id": APP_ID }
      });

      if (response.status === 401) {
        setTabSession(false);
        return null;
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw normalizeError(payload, "Authentication request failed.");
      }

      return (payload as { session?: AppAuthSession | null }).session ?? null;
    } catch {
      return null;
    }
  },

  async signIn(email: string, password: string): Promise<void> {
    await fetchAuth("/signin", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setTabSession(true);
    notifyAuthChanged();
  },

  async signUp(email: string, username: string, password: string): Promise<SignUpResult> {
    const payload = await fetchAuth("/signup", {
      method: "POST",
      body: JSON.stringify({ email, username, password })
    });
    return { verificationCode: typeof (payload as CodeResult)?.verificationCode === "string" ? (payload as CodeResult).verificationCode : undefined };
  },

  async verifySignUp(email: string, code: string): Promise<void> {
    await fetchAuth("/verify/confirm", {
      method: "POST",
      body: JSON.stringify({ email, code })
    });
  },

  async resendSignUpCode(email: string): Promise<CodeResult> {
    const payload = await fetchAuth("/verify/request", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    return { verificationCode: typeof (payload as CodeResult)?.verificationCode === "string" ? (payload as CodeResult).verificationCode : undefined };
  },

  async requestPasswordReset(email: string): Promise<CodeResult> {
    const payload = await fetchAuth("/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    return { resetCode: typeof (payload as CodeResult)?.resetCode === "string" ? (payload as CodeResult).resetCode : undefined };
  },

  async resetPassword(email: string, code: string, password: string): Promise<void> {
    await fetchAuth("/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ email, code, password })
    });
  },

  async signOut(): Promise<void> {
    try {
      await fetchAuth("/signout", { method: "POST" });
    } finally {
      setTabSession(false);
      notifyAuthChanged();
    }
  }
};