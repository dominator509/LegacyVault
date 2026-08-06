"use client";
import { useState, type FormEvent } from "react";
import { apiRequest, errorMessage, mutationHeaders } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";
const kinds = [
  "life-inventory",
  "family-emergency-guide",
  "executor-preparation-packet",
  "beneficiary-review-checklist",
  "document-gap-report",
  "household-continuity-guide",
  "annual-review",
] as const;
export function ReportGenerator() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reportId, setReportId] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await apiRequest<{
        report: { id: string; status: string };
      }>("/v1/reports", {
        method: "POST",
        headers: mutationHeaders(0),
        body: JSON.stringify({ kind: String(data.get("kind")) }),
      });
      setReportId(result.report.id);
      setSuccess("Report queued. Processing continues in the background.");
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      const result = await apiRequest<{ status: string }>(
        `/v1/reports/${reportId}`,
      );
      setSuccess(`Current report status: ${result.status}.`);
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <form onSubmit={submit}>
        <label>
          <span>Report type</span>
          <select name="kind">
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k.replaceAll("-", " ")}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy}>Generate report</button>
      </form>
      {reportId ? (
        <div className="actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh status
          </button>
          <a className="button secondary" href={`/v1/reports/${reportId}`}>
            Open report response
          </a>
        </div>
      ) : null}
      <RequestStatus busy={busy} error={error} success={success} />
    </section>
  );
}
