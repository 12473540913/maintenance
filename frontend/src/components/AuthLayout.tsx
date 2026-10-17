import type { ReactNode } from "react";
import { AuthFooter } from "./AuthFooter";
import { AuthHeader } from "./AuthHeader";

export function AuthLayout({ children, onHome }: { children: ReactNode; onHome?: () => void }) {
  return <div className="auth-shell">
    <AuthHeader onHome={onHome} />
    <main className="auth-main">{children}</main>
    <AuthFooter />
  </div>;
}
