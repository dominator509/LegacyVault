"use client";

import { useState, type FormEvent } from "react";
import { authRequest } from "../_lib/auth-client";
import { RequestStatus } from "../_components/request-status";

export function TwoFactorChallenge() {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const code = String(data.get("code") ?? "").trim();
      const trustDevice = data.get("trustDevice") === "on";
      await authRequest(
        mode === "totp"
          ? "/two-factor/verify-totp"
          : "/two-factor/verify-backup-code",
        { method: "POST", body: JSON.stringify({ code, trustDevice }) },
      );
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Verification failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="actions" role="group" aria-label="Verification method">
        <button
          type="button"
          className={mode === "totp" ? "" : "secondary"}
          onClick={() => setMode("totp")}
        >
          Authenticator code
        </button>
        <button
          type="button"
          className={mode === "backup" ? "" : "secondary"}
          onClick={() => setMode("backup")}
        >
          Recovery code
        </button>
      </div>
      <form onSubmit={verify}>
        <label>
          <span>{mode === "totp" ? "Six-digit code" : "Recovery code"}</span>
          <input
            name="code"
            inputMode={mode === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            pattern={mode === "totp" ? "[0-9]{6}" : undefined}
            required
          />
        </label>
        <label className="check">
          <input name="trustDevice" type="checkbox" />
          <span>Trust this private device for seven days</span>
        </label>
        <button disabled={busy}>Verify and continue</button>
      </form>
      <RequestStatus busy={busy} error={error} />
    </section>
  );
}
