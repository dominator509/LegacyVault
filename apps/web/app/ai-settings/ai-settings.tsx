"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  apiRequest,
  currentPersonId,
  errorMessage,
  mutationHeaders,
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
interface ActiveConsent {
  id: string;
  policyVersion: string;
  version: number;
}
export function AiSettings() {
  const [activeConsent, setActiveConsent] = useState<ActiveConsent | null>(
    null,
  );
  const [consentVersion, setConsentVersion] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState(false);
  const enabled = activeConsent !== null;
  useEffect(() => {
    let current = true;
    async function load() {
      setBusy(true);
      setError("");
      try {
        await currentPersonId();
        const result = await apiRequest<{ consent: ActiveConsent | null }>(
          "/v1/consents?purpose=external-ai",
        );
        if (!current) return;
        setActiveConsent(result.consent);
        setConsentVersion(result.consent?.version ?? 1);
      } catch (caught) {
        if (current) setError(errorMessage(caught));
      } finally {
        if (current) setBusy(false);
      }
    }
    void load();
    window.addEventListener("legacy-vault:household-change", load);
    return () => {
      current = false;
      window.removeEventListener("legacy-vault:household-change", load);
    };
  }, []);
  async function consent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const personId = await currentPersonId();
      const result = await apiRequest<ActiveConsent>("/v1/consents", {
        method: "POST",
        headers: mutationHeaders(0),
        body: JSON.stringify({
          personId,
          purpose: "external-ai",
          policyVersion: "ai-processing-notice-v1",
        }),
      });
      setActiveConsent(result);
      setConsentVersion(result.version);
      setSuccess(
        "DeepSeek processing enabled for future consent-bound requests. You can continue manually at any time.",
      );
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (!activeConsent) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest(`/v1/consents/${activeConsent.id}/withdraw`, {
        method: "POST",
        headers: mutationHeaders(activeConsent.version),
      });
      setActiveConsent(null);
      setConsentVersion(1);
      setSuccess(
        "DeepSeek processing is off for future requests. Existing confirmed vault records remain available.",
      );
    } catch (caught) {
      setError(errorMessage(caught));
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
    if (!selected.length) {
      setError("Choose at least one category before sending an AI request.");
      setBusy(false);
      return;
    }
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
          <span className="status">{enabled ? "enabled" : "off"}</span>
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
      {activeConsent ? (
        <section className="card">
          <h2>External AI is enabled</h2>
          <p>
            Active policy version: {activeConsent.policyVersion}. Withdrawal
            prevents future DeepSeek requests for this household membership.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void withdraw()}
          >
            Disable future DeepSeek processing
          </button>
        </section>
      ) : (
        <section className="card">
          <h2>Choose whether to enable external AI</h2>
          <form onSubmit={consent}>
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
      )}
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
