import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Completion, Machine, ShopSetting, TaskDefinition, TaskLedger } from "@maintenance/shared";
import { api } from "./lib/api";
import { authClient, type AppAuthSession } from "./lib/authClient";
import { AuthFooter } from "./components/AuthFooter";
import { NccFlagLink } from "./components/AuthHeader";
import { AuthLayout } from "./components/AuthLayout";
import { ProfileView } from "./components/ProfileView";
import { ShopView } from "./components/ShopView";
import { TasksView } from "./components/TasksView";
import "./styles.css";

type View = "tasks" | "shop" | "profile";
type AuthMode = "sign-in" | "sign-up" | "verify" | "forgot" | "reset";

function App() {
  const [session, setSession] = useState<AppAuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("shop");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [shops, setShops] = useState<ShopSetting[]>([{ id: "shop-1", enabled: true }]);
  const [selectedShopId, setSelectedShopId] = useState("shop-1");
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [ledgers, setLedgers] = useState<TaskLedger[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const loadData = async () => {
    const [nextMachines, nextTasks, nextLedgers, nextCompletions, nextShops] = await Promise.all([api.machines(), api.tasks(), api.ledgers(), api.completions(), api.shops()]);
    setMachines(nextMachines); setTasks(nextTasks); setLedgers(nextLedgers); setCompletions(nextCompletions); setShops(nextShops); setLoaded(true); setError("");
  };
  const saveMachineOrder = async (machineIds: string[], shopId: string) => {
    const previousMachines = machines;
    const positions = new Map(machineIds.map((id, index) => [id, index]));
    setMachines(machines
      .map((machine) => (machine.shopId ?? "shop-1") === shopId
        ? { ...machine, shopOrder: positions.get(machine.id ?? "") ?? machine.shopOrder }
        : machine));
    try {
      await api.reorderMachines(machineIds, shopId);
    } catch (reason) {
      setMachines(previousMachines);
      throw reason;
    }
  };
  useEffect(() => {
    let disposed = false;
    const loadSession = async () => {
      const nextSession = await authClient.getSession();
      if (!disposed) { setSession(nextSession); setAuthReady(true); }
    };
    const onAuthChanged = () => { void loadSession(); };
    window.addEventListener(authClient.eventName, onAuthChanged);
    void loadSession();
    return () => { disposed = true; window.removeEventListener(authClient.eventName, onAuthChanged); };
  }, []);
  useEffect(() => {
    let disposed = false;
    setMachines([]); setTasks([]); setLedgers([]); setCompletions([]); setLoaded(false); setDirty(false);
    if (session) {
      void Promise.all([api.machines(), api.tasks(), api.ledgers(), api.completions(), api.shops()]).then(([nextMachines, nextTasks, nextLedgers, nextCompletions, nextShops]) => {
        if (!disposed) { setMachines(nextMachines); setTasks(nextTasks); setLedgers(nextLedgers); setCompletions(nextCompletions); setShops(nextShops); setLoaded(true); setError(""); }
      }).catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : "Could not load your shop."); });
    }
    return () => { disposed = true; };
  }, [session, loadAttempt]);
  useEffect(() => {
    if (shops.some((shop) => shop.id === selectedShopId && shop.enabled)) return;
    setSelectedShopId(shops.find((shop) => shop.enabled)?.id ?? "shop-1");
  }, [shops, selectedShopId]);
  const navigate = (next: View) => {
    if (next === view) return;
    if (dirty && !window.confirm("Discard unsaved task changes?")) return;
    setDirty(false); setView(next);
  };
  if (!authReady) return <AuthLayout onHome={() => setView("shop")}><div className="loading" role="status">Loading...</div></AuthLayout>;
  if (!session) return <LoginView />;
  return <div className="app-shell">
    <header className="topbar">
      <button className="app-brand" type="button" onClick={() => navigate("shop")}>maintenance</button>
      <nav className="tabs" aria-label="Main navigation">
      {([["tasks", "Tasks"], ["shop", "Shop"], ["profile", "Profile"]] as const).map(([key, label]) => <button className={view === key ? "tab active" : "tab"} aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)} key={key}>{label}</button>)}
      </nav>
      <NccFlagLink />
    </header>
    <div className="site-content">
      {error && <div className="alert" role="alert">{error} <button className="text-button" onClick={() => setLoadAttempt(loadAttempt + 1)}>Retry</button></div>}
      {!loaded && !error && view !== "profile" && <p className="loading" role="status">Loading your shop...</p>}
      {loaded && view === "tasks" && <TasksView machines={machines.filter((machine) => (machine.shopId ?? "shop-1") === selectedShopId)} tasks={tasks} ledgers={ledgers} completions={completions} onDirty={setDirty} onShop={() => navigate("shop")} onSaved={(saved) => setLedgers((current) => [...current.filter((ledger) => ledger.machineId !== saved.machineId), saved])} />}
      {loaded && view === "shop" && <ShopView machines={machines.filter((machine) => (machine.shopId ?? "shop-1") === selectedShopId)} shops={shops} selectedShopId={selectedShopId} onSelectShop={setSelectedShopId} onSaved={loadData} onReorder={saveMachineOrder} />}
      {view === "profile" && <ProfileView session={session} shops={shops} shopsReady={loaded} onShopsChange={setShops} />}
    </div>
    <AuthFooter />
  </div>;
}

function LoginView() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const title = mode === "sign-up" ? "Create account" : mode === "verify" ? "Verify account" : mode === "forgot" ? "Forgot password" : mode === "reset" ? "Reset password" : "Sign In";
  const description = mode === "verify" ? `Enter the verification code sent to ${email.trim()}.` : mode === "reset" ? "Enter the reset code and choose a new password." : "";
  const submitLabel = loading ? "Working..." : mode === "sign-up" ? "Sign up" : mode === "verify" ? "Verify account" : mode === "forgot" ? "Send reset code" : mode === "reset" ? "Reset password" : "Sign In";
  const clearFeedback = () => { setError(""); setMessage(""); };
  const goTo = (nextMode: AuthMode) => { clearFeedback(); setShowPassword(false); setMode(nextMode); if (nextMode !== "verify" && nextMode !== "reset") setCode(""); };
  return <AuthLayout onHome={() => goTo("sign-in")}><form className="login-panel" onSubmit={async (event) => {
    event.preventDefault(); setLoading(true); clearFeedback();
    const trimmedEmail = email.trim();
    try {
      if (mode === "sign-in") await authClient.signIn(trimmedEmail, password);
      else if (mode === "sign-up") { await authClient.signUp(trimmedEmail, password); setMessage("Check your email for a verification code."); setMode("verify"); }
      else if (mode === "verify") { await authClient.verifySignUp(trimmedEmail, code.trim()); setMessage("Account verified. You can sign in now."); setPassword(""); setCode(""); setMode("sign-in"); }
      else if (mode === "forgot") { await authClient.requestPasswordReset(trimmedEmail); setMessage("Check your email for a reset code."); setMode("reset"); }
      else { await authClient.resetPassword(trimmedEmail, code.trim(), password); setMessage("Password updated. You can sign in now."); setPassword(""); setCode(""); setMode("sign-in"); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Authentication request failed."); }
    finally { setLoading(false); }
  }}>
    <h1>maintenance</h1><h2 className="auth-title">{title}</h2>
    {description && <p className="auth-description">{description}</p>}
    {message && <div className="notice" role="status">{message}</div>}
    {mode !== "verify" && <div className="auth-field">
      <label htmlFor="auth-email">email</label>
      <div className="auth-input">
        <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>
        <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </div>
    </div>}
    {(mode === "verify" || mode === "reset") && <div className={mode === "verify" ? "auth-field verification-code-field" : "auth-field"}>
      <label htmlFor="auth-code">Code</label>
      <input id="auth-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required />
    </div>}
    {(mode === "sign-in" || mode === "sign-up" || mode === "reset") && <div className="auth-field">
      <label htmlFor="auth-password">password</label>
      <div className="auth-input auth-password">
        <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /><circle cx="12" cy="15" r="1" /></svg>
        <input id="auth-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required />
        <button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg>
        </button>
      </div>
    </div>}
    {error && <div className="alert" role="alert">{error}</div>}
    <button className="button primary" type="submit" disabled={loading}>{submitLabel}</button>
    <div className="auth-links">
      {mode !== "sign-in" && mode !== "verify" && <button type="button" className="text-button" onClick={() => goTo("sign-in")}>Back to sign in</button>}
      {mode === "sign-in" && <><p>Don&apos;t have an account? <button type="button" className="text-button" onClick={() => goTo("sign-up")}>Sign up here.</button></p><button type="button" className="text-button" onClick={() => goTo("forgot")}>Forgot your password?</button></>}
      {mode === "verify" && <button type="button" className="text-button" disabled={loading} onClick={async () => {
        setLoading(true); clearFeedback();
        try { await authClient.resendSignUpCode(email.trim()); setCode(""); setMessage("A new verification code was sent."); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Could not resend code."); }
        finally { setLoading(false); }
      }}>Resend code</button>}
    </div>
  </form></AuthLayout>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
