"use client";
import { useState, type FormEvent } from "react";
import {
  apiRequest,
  errorMessage,
  mutationHeaders,
} from "../../../_lib/api-client";
import { RequestStatus } from "../../../_components/request-status";
export function InvitationAcceptance({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await apiRequest<{
        household: { id: string; name: string };
        membership: { role: string };
      }>(`/v1/members/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: mutationHeaders(1),
        body: JSON.stringify({ displayName: String(data.get("displayName")) }),
      });
      window.localStorage.setItem(
        "legacy-vault.household-id",
        result.household.id,
      );
      setSuccess(
        `Invitation accepted for ${result.household.name} as ${result.membership.role}.`,
      );
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
          <span>Display name shown to this household</span>
          <input
            name="displayName"
            autoComplete="name"
            required
            maxLength={160}
          />
        </label>
        <button disabled={busy}>Accept invitation</button>
      </form>
      <RequestStatus busy={busy} error={error} success={success} />
    </section>
  );
}
