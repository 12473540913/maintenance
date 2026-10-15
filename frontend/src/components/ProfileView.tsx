import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { authClient, type AppAuthSession } from "../lib/authClient";

const sections = [["identity", "Identity"], ["update", "Update Profile"], ["about", "About"]] as const;

export function ProfileView({ session }: { session: AppAuthSession }) {
  const [section, setSection] = useState<typeof sections[number][0]>("identity");
  const [username, setUsername] = useState(session.username || "");
  const [savedUsername, setSavedUsername] = useState(session.username || "");
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let disposed = false;
    setError("");
    void api.profile().then((profile) => {
      if (!disposed) { setUsername(profile.username); setSavedUsername(profile.username); setReady(true); }
    }).catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : "Could not load profile."); });
    return () => { disposed = true; };
  }, [attempt]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Account request failed."); }
    finally { setBusy(false); }
  };
  return <main className="profile-page">
    <div className="section-heading"><h2>Profile</h2><button className="button subtle" disabled={busy} onClick={() => void run(() => authClient.signOut())}>Sign out</button></div>
    <div className="profile-layout">
      <nav className="profile-nav" aria-label="Profile sections">{sections.map(([key, label]) => <button key={key} className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined} onClick={() => setSection(key)}>{label}</button>)}</nav>
      <div className="profile-panel">
        {error && <div className="alert" role="alert">{error}{!ready && <button className="text-button" onClick={() => setAttempt(attempt + 1)}>Retry</button>}</div>}
        {message && <div className="notice" role="status">{message}</div>}
        {section === "identity" && <section><h3>Identity</h3><dl className="identity-list"><div><dt>Email</dt><dd>{session.email}</dd></div><div><dt>Username</dt><dd>{ready ? savedUsername || "Not set" : error ? "Unavailable" : "Loading..."}</dd></div><div><dt>Email verified</dt><dd>{session.emailVerified ? "Yes" : "No"}</dd></div></dl></section>}
        {section === "update" && <section><h3>Update Profile</h3>
          <form className="profile-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { const saved = await api.saveProfile({ username: username.trim() }); setUsername(saved.username); setSavedUsername(saved.username); setMessage("Profile updated."); }); }}>
            <label>Username<input value={username} required minLength={3} maxLength={100} disabled={!ready || busy} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
            <p className="muted">3–100 characters. Your Maintenance profile name does not change your sign-in credentials.</p>
            <button className="button primary" disabled={!ready || busy || username.trim().length < 3 || username.trim() === savedUsername}>Save profile</button>
          </form>
          <div className="password-section"><h4>Reset password</h4><p className="muted">{codeSent ? `Enter the reset code sent to ${session.email}.` : "We'll email you a code to confirm your password change."}</p>
            <form className="profile-form" onSubmit={(event) => { event.preventDefault(); void run(async () => {
              if (!codeSent) { await authClient.requestPasswordReset(session.email); setCodeSent(true); setMessage("A reset code has been sent to your email."); }
              else { await authClient.resetPassword(session.email, code.trim(), password); setCode(""); setPassword(""); setCodeSent(false); setMessage("Password updated."); }
            }); }}>
              {codeSent && <><label>Reset code<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required disabled={busy} /></label><label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required disabled={busy} /></label></>}
              <button className="button subtle" disabled={busy}>{busy ? "Working..." : codeSent ? "Update password" : "Send reset code"}</button>
            </form>
          </div>
        </section>}
        {section === "about" && <section><h3>About</h3><p>Maintenance is a personal ledger for the things you look after.</p><p className="muted">Keep your items in Shop. Create sections, task rows, and manual timeline entries in Tasks. Everything is entered by you; no automatic scheduling is required.</p><p className="about-credit">NCC - no copyright code</p></section>}
      </div>
    </div>
  </main>;
}
