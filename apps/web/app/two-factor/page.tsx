import type { Metadata } from "next";
import { TwoFactorChallenge } from "./two-factor-challenge";

export const metadata: Metadata = { title: "Two-factor verification" };

export default function TwoFactorPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Second factor required</p>
      <h1>Verify your sign-in</h1>
      <p className="notice">
        Enter a current authenticator code or one unused recovery code. Five
        failed attempts temporarily lock verification for 15 minutes.
      </p>
      <TwoFactorChallenge />
    </main>
  );
}
