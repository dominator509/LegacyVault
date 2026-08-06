import type { Metadata } from "next";
import { AccountRecovery } from "./account-recovery";

export const metadata: Metadata = { title: "Account recovery" };

export default function RecoveryPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Secure account recovery</p>
      <h1>Reset your password</h1>
      <p className="notice">
        Reset links expire after 30 minutes and revoke existing sessions after
        use. The request response does not reveal whether an account exists.
      </p>
      <AccountRecovery />
    </main>
  );
}
