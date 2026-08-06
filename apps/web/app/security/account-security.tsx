"use client";

import { useEffect, useState, type FormEvent } from "react";
import { authClient, authClientError, authRequest } from "../_lib/auth-client";
import { RequestStatus } from "../_components/request-status";

interface PasskeyRecord {
  id: string;
  name?: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
}
interface SessionRecord {
  id: string;
  userAgent?: string | null;
  createdAt: string;
  expiresAt: string;
}
interface TotpSetup {
  totpURI: string;
  backupCodes: string[];
}

export function AccountSecurity() {
  const session = authClient.useSession();
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const twoFactorEnabled = Boolean(
    session.data?.user &&
    "twoFactorEnabled" in session.data.user &&
    session.data.user.twoFactorEnabled,
  );

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [passkeyList, sessionList] = await Promise.all([
        authRequest<PasskeyRecord[]>("/passkey/list-user-passkeys"),
        authRequest<SessionRecord[]>("/list-sessions"),
      ]);
      setPasskeys(passkeyList);
      setSessions(sessionList);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Security settings could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await authClient.passkey.addPasskey({
        name: String(data.get("name") ?? "").trim(),
      });
      if (result.error) throw new Error(authClientError(result.error));
      setSuccess("Passkey added after device verification.");
      form.reset();
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Passkey setup failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deletePasskey(id: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await authRequest("/passkey/delete-passkey", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      setSuccess("Passkey removed.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Removal failed.");
    } finally {
      setBusy(false);
    }
  }

  async function beginTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    try {
      const result = await authRequest<TotpSetup>("/two-factor/enable", {
        method: "POST",
        body: JSON.stringify({ ...(password ? { password } : {}) }),
      });
      setSetup(result);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "MFA setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    try {
      await authRequest("/two-factor/verify-totp", {
        method: "POST",
        body: JSON.stringify({ code, trustDevice: false }),
      });
      setSuccess(
        "TOTP MFA enabled. Save every recovery code before dismissing them.",
      );
      await session.refetch();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The code was not valid.",
      );
    } finally {
      setBusy(false);
    }
  }

  function saveRecoveryCodes() {
    if (!setup?.backupCodes.length) return;
    const blob = new Blob(
      [`Legacy Vault recovery codes\n${setup.backupCodes.join("\n")}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "legacy-vault-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function disableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    try {
      await authRequest("/two-factor/disable", {
        method: "POST",
        body: JSON.stringify({ ...(password ? { password } : {}) }),
      });
      setSetup(null);
      setSuccess("TOTP MFA disabled. Add another strong factor promptly.");
      await session.refetch();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "MFA disable failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeOtherSessions() {
    setBusy(true);
    setError("");
    try {
      await authRequest("/revoke-other-sessions", { method: "POST" });
      setSuccess("All other active sessions were revoked.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Session revocation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <RequestStatus busy={busy} error={error} success={success} />
      <section className="card">
        <h2>Passkeys</h2>
        {passkeys.length ? (
          <ul className="list">
            {passkeys.map((passkey) => (
              <li key={passkey.id}>
                <strong>{passkey.name || "Unnamed passkey"}</strong>
                <p>
                  {passkey.deviceType};{" "}
                  {passkey.backedUp ? "synced" : "device-bound"}; added{" "}
                  {new Date(passkey.createdAt).toLocaleDateString()}
                </p>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => void deletePasskey(passkey.id)}
                >
                  Remove passkey
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No passkeys are registered.</p>
        )}
        <form onSubmit={addPasskey}>
          <label>
            <span>Passkey name</span>
            <input name="name" required minLength={1} maxLength={80} />
          </label>
          <button disabled={busy}>Add passkey on this device</button>
        </form>
      </section>
      <section className="card">
        <h2>Authenticator app and recovery codes</h2>
        <p>
          Current state:{" "}
          <span className="status">
            {twoFactorEnabled ? "enabled" : "not enabled"}
          </span>
        </p>
        {!twoFactorEnabled && !setup ? (
          <form onSubmit={beginTotp}>
            <label>
              <span>Current password, if this account uses one</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
              />
            </label>
            <button disabled={busy}>Begin TOTP setup</button>
          </form>
        ) : null}
        {setup ? (
          <div className="stack">
            <p>
              Open this URI with your authenticator app:{" "}
              <a href={setup.totpURI}>Open authenticator setup</a>
            </p>
            <code>{setup.totpURI}</code>
            <form onSubmit={verifyTotp}>
              <label>
                <span>Six-digit authenticator code</span>
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                />
              </label>
              <button disabled={busy}>Verify and enable MFA</button>
            </form>
            <h3>One-time recovery codes</h3>
            <ul>
              {setup.backupCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <button className="secondary" onClick={saveRecoveryCodes}>
              Save recovery-code file
            </button>
            <button className="secondary" onClick={() => setSetup(null)}>
              I saved the codes; hide them
            </button>
          </div>
        ) : null}
        {twoFactorEnabled ? (
          <form onSubmit={disableTotp}>
            <label>
              <span>Current password, if this account uses one</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
              />
            </label>
            <button className="danger" disabled={busy}>
              Disable TOTP MFA
            </button>
          </form>
        ) : null}
      </section>
      <section className="card">
        <h2>Active sessions</h2>
        <p>{sessions.length} active session(s) are recorded.</p>
        <ul className="list">
          {sessions.map((item) => (
            <li key={item.id}>
              <strong>{item.userAgent || "Unidentified client"}</strong>
              <p>
                Created {new Date(item.createdAt).toLocaleString()}; expires{" "}
                {new Date(item.expiresAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
        <button
          className="danger"
          disabled={busy}
          onClick={() => void revokeOtherSessions()}
        >
          Revoke all other sessions
        </button>
      </section>
    </div>
  );
}
