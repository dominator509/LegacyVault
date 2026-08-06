"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, errorMessage, mutationHeaders } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";
import { DocumentUploader } from "./document-uploader";

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
] as const;
interface Fact {
  id: string;
  fieldKey: string;
  value: unknown;
  status: string;
  version: number;
}
interface Document {
  id: string;
  mediaType: string;
  status: string;
  version: number;
}
export function VaultWorkspace() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        apiRequest<{ facts: Fact[] }>("/v1/facts"),
        apiRequest<{ documents: Document[] }>("/v1/documents"),
      ]);
      setFacts(a.facts);
      setDocuments(b.documents);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function createFact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    const category = String(data.get("category"));
    const field = String(data.get("field"));
    try {
      await apiRequest("/v1/facts", {
        method: "POST",
        headers: mutationHeaders(0),
        body: JSON.stringify({
          fieldKey: `${category}.${field}`,
          value: String(data.get("value") ?? ""),
          sourceType: "manual",
          sourceId: crypto.randomUUID(),
          sensitivity: String(data.get("sensitivity")),
        }),
      });
      setSuccess("Candidate fact added. Review it before relying on it.");
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="split">
      <section className="stack">
        <article className="card">
          <h2>Add a candidate fact</h2>
          <p className="notice">
            Do not enter passwords, PINs, recovery codes, seed phrases, private
            keys, full payment cards, complete Social Security numbers, or safe
            combinations.
          </p>
          <form onSubmit={createFact}>
            <label>
              <span>Category</span>
              <select name="category" required>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Field name</span>
              <input
                name="field"
                required
                minLength={1}
                maxLength={100}
                pattern="[a-z0-9-]+"
                aria-describedby="field-help"
              />
              <span id="field-help" className="field-help">
                Lowercase letters, numbers, and hyphens; for example,
                carrier-name.
              </span>
            </label>
            <label>
              <span>Value</span>
              <textarea name="value" required maxLength={10000} rows={4} />
            </label>
            <label>
              <span>Sensitivity</span>
              <select name="sensitivity">
                <option value="standard">Standard</option>
                <option value="sensitive">Sensitive</option>
                <option value="highly-sensitive">Highly sensitive</option>
              </select>
            </label>
            <button disabled={busy}>Add candidate fact</button>
          </form>
        </article>
        <article className="card">
          <h2>Recorded facts</h2>
          {facts.length ? (
            <ul className="list">
              {facts.map((f) => (
                <li key={f.id}>
                  <strong>{f.fieldKey}</strong>
                  <br />
                  <span className="status">{f.status}</span>
                  {f.value !== undefined ? (
                    <p>
                      {typeof f.value === "string"
                        ? f.value
                        : JSON.stringify(f.value)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No facts are recorded in this household yet.</p>
          )}
        </article>
      </section>
      <aside className="stack">
        <RequestStatus busy={busy} error={error} success={success} />
        <section id="documents" className="card">
          <h2>Documents</h2>
          <p>
            Originals are encrypted before object storage and must pass
            quarantine before download.
          </p>
          <DocumentUploader onComplete={() => void load()} />
          {documents.length ? (
            <ul className="list">
              {documents.map((d) => (
                <li key={d.id}>
                  <strong>{d.mediaType}</strong>
                  <br />
                  <span className="status">{d.status}</span>
                  {d.status === "clean" ? (
                    <p>
                      <a href={`/v1/documents/${d.id}/content`}>
                        Download clean retained original
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No document records are available.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
