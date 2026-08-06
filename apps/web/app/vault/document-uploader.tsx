"use client";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";

export function DocumentUploader({ onComplete }: { onComplete(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    try {
      const householdId = window.localStorage.getItem(
        "legacy-vault.household-id",
      );
      if (!householdId)
        throw new Error("Select an active household before uploading.");
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "x-household-id": householdId,
          "x-request-id": crypto.randomUUID(),
        },
        body: new FormData(form),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok)
        throw new Error(payload.detail ?? "The encrypted upload failed.");
      setSuccess(
        "Encrypted upload accepted and quarantined for malware scanning and document processing.",
      );
      form.reset();
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <form onSubmit={submit}>
        <label>
          <span>PDF or image</span>
          <input
            name="document"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/tiff"
            required
          />
        </label>
        <fieldset>
          <legend>Original retention after processing</legend>
          <label className="check">
            <input type="radio" name="retention" value="keep" required />
            <span>
              Keep the encrypted original until its retention or expiry rule
              applies.
            </span>
          </label>
          <label className="check">
            <input type="radio" name="retention" value="delete" required />
            <span>
              Delete the encrypted original only after a searchable derivative
              is durable.
            </span>
          </label>
        </fieldset>
        <label className="check">
          <input type="checkbox" name="documentConsent" required />
          <span>
            I authorize document processing under document-processing-v1 and
            have authority to upload this content.
          </span>
        </label>
        <button disabled={busy}>Encrypt and upload document</button>
      </form>
      <RequestStatus busy={busy} error={error} success={success} />
    </div>
  );
}
