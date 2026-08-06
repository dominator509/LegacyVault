import type { Metadata } from "next";
import { AuthenticationForm } from "./authentication-form";

export const metadata: Metadata = { title: "Sign in" };
export default function SignInPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Secure account access</p>
      <h1>Sign in or create an account</h1>
      <p className="notice">
        Owners must enable multi-factor authentication. Never share a password,
        recovery code, or authentication factor with household members or
        support.
      </p>
      <AuthenticationForm />
    </main>
  );
}
