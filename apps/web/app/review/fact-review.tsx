"use client";
import { useEffect, useState } from "react";
import { apiRequest, errorMessage, mutationHeaders } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";
interface Fact {
  id: string;
  fieldKey: string;
  value: unknown;
  status: string;
  version: number;
  confidence?: number;
  evidenceIds?: string[];
  sourceType?: string;
}
export function FactReview() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function load() {
    setBusy(true);
    try {
      const result = await apiRequest<{ facts: Fact[] }>("/v1/facts");
      setFacts(
        result.facts.filter(
          (f) => f.status === "candidate" || f.status === "disputed",
        ),
      );
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function decide(fact: Fact, action: "confirm" | "reject") {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest(`/v1/facts/${fact.id}/${action}`, {
        method: "POST",
        headers: mutationHeaders(fact.version),
      });
      setSuccess(
        action === "confirm"
          ? "Fact confirmed and now authoritative."
          : "Candidate rejected; no confirmed fact was created.",
      );
      await load();
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <RequestStatus busy={busy} error={error} success={success} />
      {facts.length ? (
        facts.map((f) => (
          <article className="card" key={f.id}>
            <h2>{f.fieldKey}</h2>
            <dl>
              <dt>Status</dt>
              <dd>
                <span className="status">{f.status}</span>
              </dd>
              <dt>Suggested value</dt>
              <dd>
                {typeof f.value === "string"
                  ? f.value
                  : JSON.stringify(f.value)}
              </dd>
              <dt>Source</dt>
              <dd>{f.sourceType ?? "Not returned"}</dd>
              <dt>Confidence</dt>
              <dd>
                {typeof f.confidence === "number"
                  ? `${Math.round(f.confidence * 100)}% — not proof`
                  : "Not provided"}
              </dd>
              <dt>Evidence</dt>
              <dd>
                {f.evidenceIds?.length
                  ? `${f.evidenceIds.length} linked item(s)`
                  : "No evidence identifier returned"}
              </dd>
            </dl>
            <div className="actions">
              <button disabled={busy} onClick={() => void decide(f, "confirm")}>
                Confirm after checking source
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void decide(f, "reject")}
              >
                Reject suggestion
              </button>
              <a className="button secondary" href="/vault">
                Edit as a new candidate
              </a>
            </div>
          </article>
        ))
      ) : (
        <article className="card">
          <h2>No candidate facts need review</h2>
          <p>
            New manual, document, professional, or interview suggestions will
            appear here before they can become authoritative.
          </p>
        </article>
      )}
    </section>
  );
}
