"use client";

import { useEffect, useState } from "react";
import { apiRequest, errorMessage } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";

interface Fact {
  id: string;
  fieldKey: string;
  status: string;
  lastReviewedAt?: string | null;
}
interface Document {
  id: string;
  status: string;
  mediaType: string;
}
export function Dashboard() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const load = () => {
      setBusy(true);
      setError("");
      Promise.all([
        apiRequest<{ facts: Fact[] }>("/v1/facts"),
        apiRequest<{ documents: Document[] }>("/v1/documents"),
      ])
        .then(([factResult, documentResult]) => {
          setFacts(factResult.facts);
          setDocuments(documentResult.documents);
        })
        .catch((caught) => setError(errorMessage(caught)))
        .finally(() => setBusy(false));
    };
    load();
    window.addEventListener("legacy-vault:household-change", load);
    return () =>
      window.removeEventListener("legacy-vault:household-change", load);
  }, []);
  const confirmed = facts.filter((fact) => fact.status === "confirmed").length;
  const candidates = facts.filter((fact) => fact.status === "candidate").length;
  const reviewed = facts
    .map((fact) => fact.lastReviewedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const progress = facts.length
    ? Math.round((confirmed / facts.length) * 100)
    : 0;
  return (
    <>
      <p className="eyebrow">Household dashboard</p>
      <h1>Know what is ready and what needs attention.</h1>
      <RequestStatus busy={busy} error={error} />
      <section className="card primary-card" aria-labelledby="next-action">
        <h2 id="next-action">Your next action</h2>
        <p>
          {candidates
            ? `${candidates} candidate ${candidates === 1 ? "fact needs" : "facts need"} review before becoming authoritative.`
            : "Add or upload the next household record."}
        </p>
        <a className="button" href={candidates ? "/review" : "/vault"}>
          {candidates ? "Review candidate facts" : "Add a vault record"}
        </a>
      </section>
      <section className="grid" aria-label="Vault progress">
        <article className="card">
          <h2>Verified progress</h2>
          <label htmlFor="vault-progress">
            <span>{progress}% of recorded facts confirmed</span>
            <progress
              id="vault-progress"
              className="progress"
              max="100"
              value={progress}
            >
              {progress}%
            </progress>
          </label>
          <p>
            {confirmed} confirmed · {candidates} awaiting review
          </p>
        </article>
        <article className="card">
          <h2>Documents</h2>
          <p>
            {documents.length} document{" "}
            {documents.length === 1 ? "record" : "records"} in this household.
          </p>
          <a href="/vault#documents">Review documents</a>
        </article>
        <article className="card">
          <h2>Last review</h2>
          <p>
            {reviewed
              ? new Date(reviewed).toLocaleDateString()
              : "No completed review is recorded yet."}
          </p>
          <a href="/reports">Start an annual review</a>
        </article>
      </section>
      <aside className="notice">
        <strong>Safety reminder:</strong> packets are informational and may be
        incomplete or stale. Confirm facts and consult qualified professionals
        where needed.
      </aside>
    </>
  );
}
