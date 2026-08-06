"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "../_lib/api-client";
import { authClient, authClientError } from "../_lib/auth-client";
import { RequestStatus } from "../_components/request-status";

type Mode = "sign-in" | "sign-up";

export function AuthenticationForm() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function signInWithPasskey() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) throw new Error(authClientError(result.error));
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    const payload = {
      ...(mode === "sign-up"
        ? { name: String(data.get("name") ?? "").trim() }
        : {}),
      email: String(data.get("email") ?? "")
        .trim()
        .toLowerCase(),
      password: String(data.get("password") ?? ""),
    };
    try {
      const response = await fetch(
        `/api/auth/${mode === "sign-up" ? "sign-up" : "sign-in"}/email`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as {
        message?: string;
        user?: { emailVerified?: boolean };
        twoFactorRedirect?: boolean;
      };
      if (!response.ok)
        throw new Error(body.message ?? "Authentication failed.");
      if (mode === "sign-up") {
        setSuccess(
          "Account created. Check your email and verify it before signing in.",
        );
      } else if (body.twoFactorRedirect) {
        window.location.assign("/two-factor");
      } else {
        window.location.assign("/dashboard");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="auth-title">
      <div className="actions" role="group" aria-label="Choose account action">
        <button
          className={mode === "sign-in" ? "" : "secondary"}
          type="button"
          onClick={() => setMode("sign-in")}
        >
          Sign in
        </button>
        <button
          className={mode === "sign-up" ? "" : "secondary"}
          type="button"
          onClick={() => setMode("sign-up")}
        >
          Create account
        </button>
      </div>
      <h2 id="auth-title">
        {mode === "sign-in" ? "Welcome back" : "Create your account"}
      </h2>
      {mode === "sign-in" ? (
        <div className="stack">
          <button
            type="button"
            disabled={busy}
            onClick={() => void signInWithPasskey()}
          >
            Sign in with a passkey
          </button>
          <p className="field-help">
            Passkeys require user verification on this device.
          </p>
        </div>
      ) : null}
      <form onSubmit={submit}>
        {mode === "sign-up" ? (
          <label>
            <span>Name</span>
            <input name="name" autoComplete="name" required maxLength={160} />
          </label>
        ) : null}
        <label>
          <span>Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            required
            minLength={14}
            maxLength={128}
          />
        </label>
        {mode === "sign-up" ? (
          <p className="field-help">
            Use at least 14 characters. Verification is required before a
            session is created.
          </p>
        ) : null}
        <button disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
      <p>
        <a href="/recover">Forgot your password?</a>
      </p>
      <RequestStatus busy={busy} error={error} success={success} />
    </section>
  );
}
