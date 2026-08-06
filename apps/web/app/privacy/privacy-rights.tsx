"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  apiRequest,
  errorMessage,
  mutationHeaders,
  verifyTotpStepUp,
} from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";
interface PrivacyRequest {
  id: string;
  kind: string;
  status: string;
  requestedAt: string;
  recoveryUntil: string | null;
  version: number;
  workflow: { status: string; nextStep: string | null; version: number };
}
export function PrivacyRights() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<PrivacyRequest | null>(
    null,
  );
  async function load() {
    setBusy(true);
    try {
      const result = await apiRequest<{ requests: PrivacyRequest[] }>(
        "/v1/privacy-requests",
      );
      setRequests(result.requests);
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await apiRequest<{ privacyRequest: PrivacyRequest }>(
        "/v1/privacy-requests",
        {
          method: "POST",
          headers: mutationHeaders(0),
          body: JSON.stringify({
            personId: String(data.get("personId")),
            kind: String(data.get("kind")),
          }),
        },
      );
      setSuccess("Privacy request recorded. Its progress is visible below.");
      if (result.privacyRequest.kind === "deletion")
        setPendingDeletion(result.privacyRequest);
      await load();
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  async function deletion(
    action: "confirm-deletion" | "cancel-deletion",
    form?: HTMLFormElement,
  ) {
    if (!pendingDeletion) return;
    const data = form ? new FormData(form) : undefined;
    if (
      action === "confirm-deletion" &&
      String(data?.get("confirmation")) !== "DELETE"
    ) {
      setError("Type DELETE exactly before confirming account deletion.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (action === "confirm-deletion")
        await verifyTotpStepUp(String(data?.get("totp") ?? ""));
      const result = await apiRequest<{ privacyRequest: PrivacyRequest }>(
        `/v1/privacy-requests/${pendingDeletion.id}/${action}`,
        { method: "POST", headers: mutationHeaders(pendingDeletion.version) },
      );
      setSuccess(
        action === "confirm-deletion"
          ? "Deletion confirmed. The recovery window and remaining review steps are shown in the request ledger."
          : "Deletion request cancelled.",
      );
      setPendingDeletion(null);
      await load();
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <section className="card">
        <h2>Submit a request</h2>
        <form onSubmit={create}>
          <label>
            <span>Your person ID</span>
            <input name="personId" required pattern="[0-9a-fA-F-]{36}" />
            <span className="field-help">
              Requests are accepted only when this matches the authenticated
              data subject.
            </span>
          </label>
          <label>
            <span>Request type</span>
            <select name="kind">
              <option value="access">Access</option>
              <option value="correction">Correction</option>
              <option value="export">Portable export</option>
              <option value="deletion">Account deletion</option>
              <option value="appeal">Appeal</option>
            </select>
          </label>
          <button disabled={busy}>Submit privacy request</button>
        </form>
      </section>
      {pendingDeletion ? (
        <section
          className="card danger-notice"
          aria-labelledby="deletion-review"
        >
          <h2 id="deletion-review">Review deletion request</h2>
          <p>
            Deletion removes attributable account access after a recovery
            period. Shared household data, legal holds, processor confirmations,
            and backup expiry may require separate review. This does not make
            legal or processor completion automatic.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void deletion("confirm-deletion", e.currentTarget);
            }}
          >
            <label>
              <span>Type DELETE to confirm</span>
              <input name="confirmation" autoComplete="off" required />
            </label>
            <label>
              <span>Six-digit authenticator code</span>
              <input
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
              />
            </label>
            <label className="check">
              <input type="checkbox" required />
              <span>
                I understand this is a destructive privacy action and may
                require fresh multi-factor authentication.
              </span>
            </label>
            <div className="actions">
              <button className="danger" disabled={busy}>
                Confirm deletion
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => void deletion("cancel-deletion")}
              >
                Cancel request
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <section className="card">
        <h2>Request ledger</h2>
        {requests.length ? (
          <ul className="list">
            {requests.map((r) => (
              <li key={r.id}>
                <strong>{r.kind}</strong>{" "}
                <span className="status">{r.status}</span>
                <dl>
                  <dt>Requested</dt>
                  <dd>{new Date(r.requestedAt).toLocaleString()}</dd>
                  <dt>Workflow</dt>
                  <dd>{r.workflow.status}</dd>
                  <dt>Next step</dt>
                  <dd>{r.workflow.nextStep ?? "None recorded"}</dd>
                  <dt>Recovery until</dt>
                  <dd>
                    {r.recoveryUntil
                      ? new Date(r.recoveryUntil).toLocaleString()
                      : "Not applicable"}
                  </dd>
                </dl>
                {r.kind === "deletion" && r.status === "pending" ? (
                  <button
                    className="secondary"
                    onClick={() => setPendingDeletion(r)}
                  >
                    Review deletion
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No privacy requests are recorded for this subject.</p>
        )}
      </section>
      <RequestStatus busy={busy} error={error} success={success} />
    </div>
  );
}
