"use client";
import { useState, type FormEvent } from "react";
import { apiRequest, errorMessage, mutationHeaders } from "../_lib/api-client";
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
export function AiSettings() {
  const [enabled, setEnabled] = useState(false);
  const [consentVersion, setConsentVersion] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState(false);
  async function consent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await apiRequest<{ version: number }>("/v1/consents", {
        method: "POST",
        headers: mutationHeaders(0),
        body: JSON.stringify({
          personId: String(data.get("personId")),
          purpose: "external-ai",
          policyVersion: "ai-processing-notice-v1",
        }),
      });
      setConsentVersion(result.version);
      setEnabled(true);
      setSuccess(
        "DeepSeek processing enabled for future consent-bound requests. You can continue manually at any time.",
      );
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  async function interview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(e.currentTarget);
    const selected = categories.filter((c) =>
      data.getAll("categories").includes(c),
    );
    try {
      const result = await apiRequest<{
        response?: unknown;
        candidates?: unknown[];
      }>("/v1/ai-settings/interview", {
        method: "POST",
        headers: mutationHeaders(consentVersion),
        body: JSON.stringify({
          message: String(data.get("message")),
          categories: selected,
        }),
      });
      setSuccess(
        `DeepSeek returned a policy-validated suggestion${result.candidates?.length ? ` with ${result.candidates.length} candidate fact(s)` : ""}. Nothing was confirmed automatically.`,
      );
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <section className="card primary-card">
        <p>
          <strong>Provider:</strong> DeepSeek. <strong>Current state:</strong>{" "}
          <span className="status">
            {enabled ? "enabled in this session" : "off"}
          </span>
        </p>
        <p>
          Legacy Vault can send minimized and redacted content to DeepSeek to
          classify documents, suggest extracted facts, summarize confirmed
          information, and phrase interview questions.
        </p>
        <p className="danger-notice notice">
          Do not enter passwords, PINs, recovery codes, seed phrases, private
          keys, complete Social Security numbers, complete payment-card numbers,
          or safe combinations. AI can be wrong. Nothing becomes confirmed until
          you approve it.
        </p>
        <button
          className="secondary"
          type="button"
          aria-expanded={detail}
          onClick={() => setDetail((v) => !v)}
        >
          {detail ? "Hide detailed notice" : "Read detailed processing notice"}
        </button>
        {detail ? (
          <div>
            <h2>Detailed notice</h2>
            <p>
              Data categories are selected per request. Provider legal entity,
              countries, retention, secondary use, deletion limits, security
              terms, and subprocessors remain unknown until archived vendor and
              counsel review is complete. Production enablement remains blocked.
              Withdrawal prevents future processing but cannot guarantee
              deletion beyond verified provider mechanisms.
            </p>
          </div>
        ) : null}
      </section>
      <section className="card">
        <h2>Choose whether to enable external AI</h2>
        <form onSubmit={consent}>
          <label>
            <span>Your person ID</span>
            <input
              name="personId"
              required
              pattern="[0-9a-fA-F-]{36}"
              aria-describedby="person-help"
            />
            <span id="person-help" className="field-help">
              Use your authenticated person identifier. Consent cannot be
              submitted for another person.
            </span>
          </label>
          <label className="check">
            <input type="checkbox" required />
            <span>
              I affirmatively enable DeepSeek processing under AI Processing
              Notice v1. This box is not pre-checked.
            </span>
          </label>
          <div className="actions">
            <button disabled={busy}>Enable DeepSeek processing</button>
            <a className="button secondary" href="/vault">
              Continue without external AI
            </a>
          </div>
        </form>
      </section>
      {enabled ? (
        <section className="card">
          <h2>AI interview</h2>
          <form onSubmit={interview}>
            <fieldset>
              <legend>Categories sent</legend>
              {categories.map((c) => (
                <label className="check" key={c}>
                  <input type="checkbox" name="categories" value={c} />
                  <span>{c.replaceAll("-", " ")}</span>
                </label>
              ))}
            </fieldset>
            <label>
              <span>Your message</span>
              <textarea name="message" required maxLength={20000} rows={6} />
            </label>
            <button disabled={busy}>Send minimized interview turn</button>
          </form>
        </section>
      ) : null}
      <RequestStatus busy={busy} error={error} success={success} />
    </div>
  );
}
