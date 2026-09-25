import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DueInstance, Machine, Rule, ValidationValue } from "@maintenance/shared";
import { api } from "./lib/api";
import { authClient, type AppAuthSession } from "./lib/authClient";
import { DataValidationView } from "./components/DataValidationView";
import { MachineDialog } from "./components/MachineDialog";
import "./styles.css";

type View = "dashboard" | "machines" | "rules" | "validation";
type AuthMode = "sign-in" | "sign-up" | "verify" | "forgot" | "reset";

function App() {
  const [session, setSession] = useState<AppAuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [due, setDue] = useState<DueInstance[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [validationValues, setValidationValues] = useState<ValidationValue[]>([]);
  const [error, setError] = useState("");
  const reload = () => Promise.all([api.dashboard(), api.machines(), api.rules(), api.validationValues()]).then(([nextDue, nextMachines, nextRules, nextValidationValues]) => { setDue(nextDue); setMachines(nextMachines); setRules(nextRules); setValidationValues(nextValidationValues); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not reach the API."));
  useEffect(() => {
    let disposed = false;
    const loadSession = async () => {
      const nextSession = await authClient.getSession();
      if (disposed) return;
      setSession(nextSession);
      setAuthReady(true);
    };
    const onAuthChanged = () => { void loadSession(); };
    window.addEventListener(authClient.eventName, onAuthChanged);
    void loadSession();
    return () => { disposed = true; window.removeEventListener(authClient.eventName, onAuthChanged); };
  }, []);
  useEffect(() => { if (session) void reload(); }, [session]);
  if (!authReady) return null;
  if (!session) return <LoginView />;
  const counts = { overdue: due.filter((item) => item.status === "overdue").length, soon: due.filter((item) => item.status === "due-soon").length };
  return <div className="app-shell">
    <header className="topbar"><div><p className="eyebrow">PERSONAL WORKSHOP</p><h1>Maintenance ledger</h1></div><div className="account-actions"><span className="sync-dot">● Cloud connected</span><span>{session.email}</span><button className="text-button" onClick={() => void authClient.signOut()}>Sign out</button></div></header>
    <nav className="tabs">{([["dashboard", "Dashboard"], ["machines", "Machines"], ["rules", "Rules"], ["validation", "Data Validation"]] as const).map(([key, label]) => <button className={view === key ? "tab active" : "tab"} onClick={() => setView(key)} key={key}>{label}</button>)}</nav>
    {error && <div className="alert">{error} <button onClick={() => { setError(""); void reload(); }}>Retry</button></div>}
    {view === "dashboard" && <main><section className="intro"><div><p className="eyebrow">TODAY'S VIEW</p><h2>Keep every machine ready.</h2><p>Upcoming and overdue work, gathered in one calm place.</p></div><div className="stat-row"><div><strong>{counts.overdue}</strong><span>Overdue</span></div><div><strong>{counts.soon}</strong><span>Due soon</span></div><div><strong>{machines.length}</strong><span>Machines</span></div></div></section><section className="section-heading"><div><p className="eyebrow">ACTION QUEUE</p><h2>Maintenance horizon</h2></div><button className="button subtle" onClick={() => void reload()}>Refresh</button></section><div className="task-grid">{due.length ? due.map((item) => <article className={`task-card ${item.status}`} key={item.task.id}><div className="task-card-top"><span className="badge">{item.status.replace("-", " ")}</span><span className="task-category">{item.task.category}</span></div><h3>{item.task.name}</h3><p>{item.machine.year} {item.machine.make} {item.machine.model ?? ""}</p><div className="task-meta"><span>{item.dueOdometer ? `${item.dueOdometer.toLocaleString()} mi` : "Date based"}</span><span>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "No date"}</span></div></article>) : <div className="empty">No task instances yet. Add machines, rules, and task definitions to build the queue.</div>}</div></main>}
    {view === "machines" && <MachineView machines={machines} validationValues={validationValues} onSaved={reload} />}
    {view === "rules" && <RuleView rules={rules} />}
    {view === "validation" && <DataValidationView values={validationValues} onChanged={reload} />}
  </div>;
}

function LoginView() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const title = mode === "sign-up" ? "Create account" : mode === "verify" ? "Verify account" : mode === "forgot" ? "Forgot password" : mode === "reset" ? "Reset password" : "Maintenance ledger";
  const description = mode === "sign-up" ? "Create a maintenance account." : mode === "verify" ? "Enter the verification code sent to your email." : mode === "forgot" ? "Request a reset code for your maintenance account." : mode === "reset" ? "Enter the reset code and choose a new password." : "Sign in with your maintenance account.";
  const submitLabel = loading ? "Working..." : mode === "sign-up" ? "Sign up" : mode === "verify" ? "Verify account" : mode === "forgot" ? "Send reset code" : mode === "reset" ? "Reset password" : "Sign in";
  const clearFeedback = () => { setError(""); setMessage(""); };
  const goTo = (nextMode: AuthMode) => { clearFeedback(); setMode(nextMode); if (nextMode !== "verify" && nextMode !== "reset") setCode(""); };
  return <main className="login-page"><form className="login-panel" onSubmit={async (event) => { event.preventDefault(); setLoading(true); clearFeedback(); const trimmedEmail = email.trim(); try { if (mode === "sign-in") { await authClient.signIn(trimmedEmail, password); } else if (mode === "sign-up") { await authClient.signUp(trimmedEmail, username.trim(), password); setMessage("Check your email for a verification code."); setMode("verify"); } else if (mode === "verify") { await authClient.verifySignUp(trimmedEmail, code.trim()); setMessage("Account verified. You can sign in now."); setPassword(""); setCode(""); setMode("sign-in"); } else if (mode === "forgot") { await authClient.requestPasswordReset(trimmedEmail); setMessage("Check your email for a reset code."); setMode("reset"); } else { await authClient.resetPassword(trimmedEmail, code.trim(), password); setMessage("Password updated. You can sign in now."); setPassword(""); setCode(""); setMode("sign-in"); } } catch (reason) { setError(reason instanceof Error ? reason.message : "Authentication request failed."); } finally { setLoading(false); } }}><p className="eyebrow">PERSONAL WORKSHOP</p><h1>{title}</h1><p>{description}</p>{message && <div className="notice">{message}</div>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>{mode === "sign-up" && <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>}{(mode === "verify" || mode === "reset") && <label>Code<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required /></label>}{mode !== "forgot" && mode !== "verify" && <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required /></label>}{error && <div className="alert">{error}</div>}<button className="button primary" type="submit" disabled={loading}>{submitLabel}</button><div className="auth-links">{mode !== "sign-in" && <button type="button" className="text-button" onClick={() => goTo("sign-in")}>Back to sign in</button>}{mode === "sign-in" && <button type="button" className="text-button" onClick={() => goTo("sign-up")}>Sign up</button>}{mode === "sign-in" && <button type="button" className="text-button" onClick={() => goTo("forgot")}>Forgot password?</button>}{mode === "verify" && <button type="button" className="text-button" onClick={async () => { setLoading(true); clearFeedback(); try { await authClient.resendSignUpCode(email.trim()); setMessage("A new verification code was sent."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not resend code."); } finally { setLoading(false); } }}>Resend code</button>}</div></form></main>;
}

function MachineView({ machines, validationValues, onSaved }: { machines: Machine[]; validationValues: ValidationValue[]; onSaved: () => Promise<unknown> }) {
  const [editing, setEditing] = useState<Machine | null>(null);
  const [adding, setAdding] = useState(false);
  return <main><section className="section-heading"><div><p className="eyebrow">YOUR FLEET</p><h2>Machines</h2><p>Hard points, service dates, and current odometer readings.</p></div><button className="button primary" onClick={() => setAdding(true)}>+ Add machine</button></section><div className="machine-grid">{machines.map((machine) => <article className="machine-card" key={machine.id}><div className="machine-icon">{machine.type.slice(0, 1)}</div><div><span className="eyebrow">{machine.code}</span><h3>{machine.year} {machine.make} {machine.model}</h3><p>{machine.type} · {machine.status}</p></div><div className="odo"><span>Current odometer</span><strong>{machine.currentOdometer?.toLocaleString() ?? "Not set"}</strong><button className="text-button" onClick={() => setEditing(machine)}>Update reading</button></div></article>)}</div>{adding && <MachineDialog validationValues={validationValues} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await onSaved(); }} />}{editing && <OdometerDialog machine={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onSaved(); }} />}</main>;
}
function OdometerDialog({ machine, onClose, onSaved }: { machine: Machine; onClose: () => void; onSaved: () => Promise<void> }) { const [odometer, setOdometer] = useState(String(machine.currentOdometer ?? "")); return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); await api.updateOdometer(machine.id!, Number(odometer), new Date().toISOString()); await onSaved(); }}><div className="section-heading"><h2>Update reading</h2><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Current odometer<input value={odometer} onChange={(event) => setOdometer(event.target.value)} type="number" min="0" required /></label><button className="button primary" type="submit">Save reading</button></form></div>; }
function RuleView({ rules }: { rules: Rule[] }) { return <main><section className="section-heading"><div><p className="eyebrow">SCHEDULING LOGIC</p><h2>Rules</h2><p>Reusable triggers for every maintenance task.</p></div><button className="button primary">+ New rule</button></section><div className="rule-list">{rules.map((rule) => <article className="rule-row" key={rule.id}><div><span className="badge neutral">{rule.kind}</span><h3>{rule.name}</h3></div><p>{rule.mileageInterval ? `Every ${rule.mileageInterval.toLocaleString()} miles` : ""}{rule.mileageInterval && rule.yearsInterval ? " or " : ""}{rule.yearsInterval ? `every ${rule.yearsInterval} years` : ""}</p><button className="text-button">Edit</button></article>)}</div></main>; }

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
