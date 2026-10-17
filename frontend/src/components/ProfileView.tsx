import { useState } from "react";
import type { ShopSetting } from "@maintenance/shared";
import { authClient, type AppAuthSession } from "../lib/authClient";
import { api } from "../lib/api";

const sections = [["identity", "Identity"], ["controls", "Controls"], ["session", "Session"], ["about", "About"]] as const;

export function ProfileView({ session, shops, shopsReady, onShopsChange }: {
  session: AppAuthSession;
  shops: ShopSetting[];
  shopsReady: boolean;
  onShopsChange: (shops: ShopSetting[]) => void;
}) {
  const [section, setSection] = useState<typeof sections[number][0]>("identity");
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingShops, setSavingShops] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Account request failed."); }
    finally { setBusy(false); }
  };
  const saveShops = async (nextShops: ShopSetting[]) => {
    setSavingShops(true);
    setError("");
    setMessage("");
    try { onShopsChange(await api.saveShops(nextShops)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save shop controls."); }
    finally { setSavingShops(false); }
  };
  return <main className="profile-page">
    <div className="profile-layout">
      <nav className="profile-nav" aria-label="Profile sections">{sections.map(([key, label]) => <button key={key} className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined} onClick={() => setSection(key)}>{label}</button>)}</nav>
      <div className={`profile-panel${section === "about" ? " about-panel" : ""}`}>
        {error && <div className="alert" role="alert">{error}</div>}
        {message && <div className="notice" role="status">{message}</div>}
        {section === "identity" && <section><dl className="identity-list"><div><dt>Email</dt><dd>{session.email}</dd></div><div><dt>Email verified</dt><dd>{session.emailVerified ? "Yes" : "No"}</dd></div></dl></section>}
        {section === "controls" && <section className="shop-controls">
          <div className="shop-controls-heading">
            <div><h3>Controls</h3><p className="muted">Enable shops to make them available from the Shop screen.</p></div>
            <button className="button primary shop-add-button" disabled={!shopsReady || savingShops} aria-label="Add shop" onClick={() => {
              const nextNumber = Math.max(0, ...shops.map(({ id }) => Number(id.slice("shop-".length)))) + 1;
              void saveShops([...shops, { id: `shop-${nextNumber}`, enabled: true }]);
            }}>+ Add shop</button>
          </div>
          {!shopsReady ? <p className="muted" role="status">Loading shop controls...</p> : <div className="shop-control-list">
            {shops.map(({ id, enabled }) => {
              const number = Number(id.slice("shop-".length));
              const enabledCount = shops.filter((shop) => shop.enabled).length;
              return <div className="shop-control-row" key={id}>
                <span>{`Shop ${number}`}</span>
                <label className="shop-toggle">
                  <input type="checkbox" checked={enabled} disabled={savingShops || (enabled && enabledCount === 1)} onChange={(event) => {
                    const nextShops = shops.map((shop) => shop.id === id ? { ...shop, enabled: event.target.checked } : shop);
                    void saveShops(nextShops);
                  }} />
                  <span>{enabled ? "Enabled" : "Disabled"}</span>
                </label>
              </div>;
            })}
          </div>}
        </section>}
        {section === "session" && <section>
          <div className="account-actions">
            <button className="button subtle" disabled={busy} onClick={() => void run(() => authClient.signOut())}>Sign Out</button>
            <button className="button subtle" disabled={busy} aria-expanded={passwordFormOpen} aria-controls="change-password-form" onClick={() => { setPasswordFormOpen(true); setError(""); setMessage(""); }}>Change Your Password</button>
          </div>
          {passwordFormOpen && <form id="change-password-form" className="profile-form password-form" onSubmit={(event) => { event.preventDefault(); void run(async () => {
              if (password !== confirmation) throw new Error("New passwords do not match.");
              await authClient.changePassword(currentPassword, password);
              setCurrentPassword(""); setPassword(""); setConfirmation(""); setPasswordFormOpen(false);
              setMessage("Password changed. You are still signed in; other sessions have been signed out.");
            }); }}>
              <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required disabled={busy} /></label>
              <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).*" title="Use at least 8 characters including lowercase, uppercase, and a number." disabled={busy} /></label>
              <label>Confirm new password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required disabled={busy} /></label>
              <p className="muted">Use at least 8 characters including lowercase, uppercase, and a number.</p>
              <div className="account-actions">
                <button className="button primary" disabled={busy}>{busy ? "Changing password..." : "Submit"}</button>
                <button className="button subtle" type="button" disabled={busy} onClick={() => { setPasswordFormOpen(false); setCurrentPassword(""); setPassword(""); setConfirmation(""); setError(""); }}>Cancel</button>
              </div>
          </form>}
        </section>}
        {section === "about" && <div className="about-sections">
          <section className="about-section"><h3>About Maintenance</h3>
            <p>Maintenance is a personal ledger for the things you look after. Keep item details, maintenance tasks, and service history organized in one place, with everything entered and managed by you.</p>
            <p>Repository: <a href="https://github.com/12473540913/maintenance" target="_blank" rel="noopener noreferrer">github.com/1247350913/maintenance</a></p>
            <p>Contact: open an issue in the repository for bugs, feedback, and feature requests.</p>
          </section>
          <section className="about-section"><h3>About NCC</h3>
            <p>See the <a href="https://ncc.lnks.rip" target="_blank" rel="noopener noreferrer">website</a> for more details.</p>
            <p>Repository: <a href="https://github.com/12473540913/NCC" target="_blank" rel="noopener noreferrer">https://github.com/12473540913/NCC</a></p>
            <p>Contact: open an issue in the repository for bugs, feedback, and feature requests.</p>
          </section>
        </div>}
      </div>
    </div>
  </main>;
}
