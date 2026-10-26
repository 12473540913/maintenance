import flag from "../assets/flag.jpg";

export function NccFlagLink() {
  return <a className="auth-flag-link" href="https://ncc.lnks.rip" target="_blank" rel="noopener noreferrer" aria-label="Visit NCC website">
    <img src={flag} alt="" />
  </a>;
}

export function AuthHeader({ onHome }: { onHome?: () => void }) {
  return <header className="auth-header">
    {onHome
      ? <button className="auth-brand" type="button" onClick={onHome}>maintenance</button>
      : <span className="auth-brand">maintenance</span>}
    <NccFlagLink />
  </header>;
}
