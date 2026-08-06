"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, errorMessage, mutationHeaders } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";
const roles = [
  "CoOwner",
  "Editor",
  "FamilyHelper",
  "ProfessionalAdvisor",
  "ReadOnlyViewer",
  "EmergencyRecipient",
] as const;
interface Member {
  id: string;
  displayName: string;
  role: string;
  active: boolean;
  version: number;
}
interface Household {
  id: string;
  version: number;
}
export function MemberAdministration() {
  const [members, setMembers] = useState<Member[]>([]);
  const [householdVersion, setHouseholdVersion] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingInvite, setPendingInvite] = useState<{
    id: string;
    version: number;
  } | null>(null);
  async function load() {
    setBusy(true);
    try {
      const [memberResult, householdResult] = await Promise.all([
        apiRequest<{ members: Member[] }>("/v1/members"),
        apiRequest<{ households: Household[] }>("/v1/households"),
      ]);
      setMembers(memberResult.members);
      const active = window.localStorage.getItem("legacy-vault.household-id");
      setHouseholdVersion(
        householdResult.households.find((h) => h.id === active)?.version ??
          householdResult.households[0]?.version ??
          1,
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
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await apiRequest<{
        invitation: { id: string; version: number };
        householdVersion: number;
      }>("/v1/members/invitations", {
        method: "POST",
        headers: mutationHeaders(householdVersion),
        body: JSON.stringify({
          email: String(data.get("email")),
          role: String(data.get("role")),
        }),
      });
      setPendingInvite(result.invitation);
      setHouseholdVersion(result.householdVersion);
      setSuccess("Invitation sent. The link expires in 72 hours.");
      e.currentTarget.reset();
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  async function changeRole(member: Member, role: string) {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        membership: Member;
        householdVersion: number;
      }>(`/v1/members/${member.id}/role`, {
        method: "POST",
        headers: mutationHeaders(member.version),
        body: JSON.stringify({ role }),
      });
      setMembers((values) =>
        values.map((value) =>
          value.id === member.id ? { ...value, ...result.membership } : value,
        ),
      );
      setHouseholdVersion(result.householdVersion);
      setSuccess("Member role updated.");
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!pendingInvite) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ householdVersion: number }>(
        `/v1/members/invitations/${pendingInvite.id}/revoke`,
        { method: "POST", headers: mutationHeaders(pendingInvite.version) },
      );
      setHouseholdVersion(result.householdVersion);
      setPendingInvite(null);
      setSuccess(
        "Unused invitation revoked. Its token can no longer be accepted.",
      );
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="split">
      <section className="card">
        <h2>Active members</h2>
        {members.length ? (
          <ul className="list">
            {members.map((m) => (
              <li key={m.id}>
                <strong>{m.displayName}</strong>
                <p>
                  <span className="status">{m.role}</span>
                </p>
                {m.role !== "Owner" ? (
                  <label>
                    <span>Change role</span>
                    <select
                      value={
                        roles.includes(m.role as (typeof roles)[number])
                          ? m.role
                          : "ReadOnlyViewer"
                      }
                      disabled={busy}
                      onChange={(e) =>
                        void changeRole(m, e.currentTarget.value)
                      }
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="muted">
                    The Owner role cannot be demoted or assigned through member
                    administration.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No active members were returned.</p>
        )}
      </section>
      <aside className="stack">
        <section className="card">
          <h2>Invite a member</h2>
          <form onSubmit={invite}>
            <label>
              <span>Verified email address</span>
              <input name="email" type="email" required maxLength={254} />
            </label>
            <label>
              <span>Role</span>
              <select name="role">
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>Send invitation</button>
          </form>
          {pendingInvite ? (
            <button
              className="danger"
              disabled={busy}
              onClick={() => void revoke()}
            >
              Revoke latest unused invitation
            </button>
          ) : null}
        </section>
        <RequestStatus busy={busy} error={error} success={success} />
      </aside>
    </div>
  );
}
