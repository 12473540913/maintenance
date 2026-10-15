import flag from "../assets/flag.jpg";

export function AuthHeader() {
  return <header className="auth-header">
    <span className="auth-brand">maintenance</span>
    <a className="auth-flag-link" href="https://ncc.lnks.rip" target="_blank" rel="noopener noreferrer" aria-label="Visit NCC website">
      <img src={flag} alt="" />
    </a>
  </header>;
}
