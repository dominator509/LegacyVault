"use client";
import { useState, type FormEvent } from "react";
import {
  apiRequest,
  errorMessage,
  mutationHeaders,
  verifyTotpStepUp,
} from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";
const categories = [
  "contacts",
  "advisers",
  "dependents",
  "pets",
  "assets",
  "liabilities",
  "insurance",
  "property",
  "estate-documents",
  "medical-summary",
  "digital-asset-locations",
  "household-instructions",
  "funeral-preferences",
];
interface Draft {
  recipientMembershipId: string;
  categories: string[];
  reason: string;
}
export function EmergencyAccess() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function review(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const selected = data.getAll("categories").map(String);
    if (!selected.length) {
      setError("Choose at least one category.");
      return;
    }
    setError("");
    setDraft({
      recipientMembershipId: String(data.get("recipientMembershipId")),
      categories: selected,
      reason: String(data.get("reason")),
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData(event.currentTarget);
      await verifyTotpStepUp(String(data.get("totp") ?? ""));
      await apiRequest("/v1/emergency-access", {
        method: "POST",
        headers: mutationHeaders(0),
        body: JSON.stringify(draft),
      });
      setSuccess(
        "Emergency request recorded. No information has been released; owner review and the configured delay are still required.",
      );
      setDraft(null);
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <section className="notice">
        <strong>Not an emergency service.</strong> Legacy Vault does not
        determine incapacity, death, executor status, or legal entitlement. Call
        local emergency services when immediate help is needed.
      </section>
      {draft ? (
        <section className="card primary-card">
          <h2>Review before submitting</h2>
          <dl>
            <dt>Recipient membership</dt>
            <dd>
              <code>{draft.recipientMembershipId}</code>
            </dd>
            <dt>Categories</dt>
            <dd>{draft.categories.join(", ")}</dd>
            <dt>Reason</dt>
            <dd>{draft.reason}</dd>
          </dl>
          <p>
            Submitting creates an audited request only. It does not release
            records.
          </p>
          <form onSubmit={submit}>
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
            <div className="actions">
              <button disabled={busy}>Submit audited request</button>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Go back and edit
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="card">
          <h2>Request bounded access</h2>
          <form onSubmit={review}>
            <label>
              <span>Your EmergencyRecipient membership ID</span>
              <input
                name="recipientMembershipId"
                required
                pattern="[0-9a-fA-F-]{36}"
              />
            </label>
            <fieldset>
              <legend>Requested categories</legend>
              {categories.map((c) => (
                <label className="check" key={c}>
                  <input type="checkbox" name="categories" value={c} />
                  <span>{c.replaceAll("-", " ")}</span>
                </label>
              ))}
            </fieldset>
            <label>
              <span>Reason for this request</span>
              <textarea name="reason" required maxLength={2000} rows={5} />
            </label>
            <button>Review request</button>
          </form>
        </section>
      )}
      <RequestStatus busy={busy} error={error} success={success} />
    </div>
  );
}
