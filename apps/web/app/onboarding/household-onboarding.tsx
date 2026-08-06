"use client";

import { useState, type FormEvent } from "react";
import { apiRequest, errorMessage, mutationHeaders } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";

export function HouseholdOnboarding() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<{
        household: { id: string; name: string };
      }>("/v1/households", {
        method: "POST",
        headers: mutationHeaders(0),
        body: JSON.stringify({
          organizationName: String(data.get("organizationName") ?? ""),
          householdName: String(data.get("householdName") ?? ""),
          ownerDisplayName: String(data.get("ownerDisplayName") ?? ""),
        }),
      });
      window.localStorage.setItem(
        "legacy-vault.household-id",
        result.household.id,
      );
      setSuccess(`${result.household.name} is ready. Opening your dashboard…`);
      window.setTimeout(() => window.location.assign("/dashboard"), 700);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <form onSubmit={submit}>
        <label>
          <span>Organization name</span>
          <input
            name="organizationName"
            required
            maxLength={160}
            autoComplete="organization"
          />
        </label>
        <label>
          <span>Household name</span>
          <input name="householdName" required maxLength={160} />
        </label>
        <label>
          <span>Your display name</span>
          <input
            name="ownerDisplayName"
            required
            maxLength={160}
            autoComplete="name"
          />
        </label>
        <button disabled={busy}>Create household</button>
      </form>
      <RequestStatus busy={busy} error={error} success={success} />
    </section>
  );
}
