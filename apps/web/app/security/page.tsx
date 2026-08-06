import type { Metadata } from "next";
import { AccountSecurity } from "./account-security";

export const metadata: Metadata = { title: "Account security" };

export default function SecurityPage() {
  return (
    <main id="main-content" className="wide">
      <p className="eyebrow">Authentication and recovery</p>
      <h1>Protect your account</h1>
      <p className="notice">
        Passkeys use device verification. TOTP recovery codes are single-use
        secrets: save them offline and never upload them to this vault.
      </p>
      <AccountSecurity />
    </main>
  );
}
