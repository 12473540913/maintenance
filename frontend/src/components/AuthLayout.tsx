import type { ReactNode } from "react";
import { AuthFooter } from "./AuthFooter";
import { AuthHeader } from "./AuthHeader";

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-shell">
    <AuthHeader />
    <main className="auth-main">{children}</main>
    <AuthFooter />
  </div>;
}
