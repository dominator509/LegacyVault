"use client";

import { useEffect, useState, type FormEvent } from "react";
import { authRequest } from "../_lib/auth-client";
import { RequestStatus } from "../_components/request-status";

export function AccountRecovery() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [token, setToken] = useState("");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setToken(query.get("token") ?? "");
    if (query.get("error") === "INVALID_TOKEN")
      setError("The recovery link is invalid, expired, or already used.");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      if (token) {
        const password = String(data.get("password") ?? "");
        const confirmation = String(data.get("confirmation") ?? "");
        if (password !== confirmation)
          throw new Error("The password confirmation does not match.");
        await authRequest("/reset-password", {
          method: "POST",
          body: JSON.stringify({ newPassword: password, token }),
        });
        setSuccess(
          "Password reset complete. Existing sessions were revoked; sign in again.",
        );
      } else {
        await authRequest("/request-password-reset", {
          method: "POST",
          body: JSON.stringify({
            email: String(data.get("email") ?? "")
              .trim()
              .toLowerCase(),
            redirectTo: `${window.location.origin}/recover`,
          }),
        });
        setSuccess(
          "If the account exists, a time-limited recovery link has been sent.",
        );
      }
      form.reset();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The recovery request could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <form onSubmit={submit}>
        {token ? (
          <>
            <label>
              <span>New password</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                maxLength={128}
                required
              />
            </label>
            <label>
              <span>Confirm new password</span>
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={14}
                maxLength={128}
                required
              />
            </label>
            <button disabled={busy}>Reset password</button>
          </>
        ) : (
          <>
            <label>
              <span>Account email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <button disabled={busy}>Send recovery link</button>
          </>
        )}
      </form>
      <RequestStatus busy={busy} error={error} success={success} />
      <p>
        <a href="/sign-in">Return to sign in</a>
      </p>
    </section>
  );
}
