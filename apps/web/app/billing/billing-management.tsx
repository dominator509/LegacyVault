"use client";
import { useEffect, useState } from "react";
import { apiRequest, errorMessage, mutationHeaders } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";

interface Subscription {
  status: string;
  plan: string | null;
  version: number;
  access: string;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
  entitlements: Record<string, boolean>;
  quotas: Record<string, number | null>;
}
interface Refund {
  id: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  providerUpdatedAt: string;
}

function formatRefundAmount(refund: Refund): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: refund.currency.toUpperCase(),
    }).format(refund.amount / 100);
  } catch {
    return `${refund.amount} ${refund.currency.toUpperCase()} minor units`;
  }
}

function stripeHostedUrl(value: string): URL {
  const destination = new URL(value);
  if (
    destination.protocol !== "https:" ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(
      destination.hostname,
    )
  )
    throw new Error("Stripe returned an unsafe billing URL.");
  return destination;
}

export function BillingManagement() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [state, refundState] = await Promise.all([
        apiRequest<Subscription>("/v1/billing/subscription"),
        apiRequest<{ refunds: Refund[] }>("/v1/billing/refunds"),
      ]);
      setSubscription(state);
      setRefunds(refundState.refunds);
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function open(kind: "checkout" | "portal") {
    if (!subscription) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await apiRequest<{ url: string }>(`/v1/billing/${kind}`, {
        method: "POST",
        headers: mutationHeaders(subscription.version),
      });
      const destination = stripeHostedUrl(result.url);
      setSuccess(
        `Opening Stripe ${kind === "checkout" ? "checkout" : "billing management"}.`,
      );
      window.location.assign(destination.toString());
    } catch (c) {
      setError(c instanceof Error ? c.message : errorMessage(c));
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <RequestStatus busy={busy} error={error} success={success} />
      <section className="card primary-card">
        <h2>Current access</h2>
        {subscription ? (
          <>
            <dl>
              <dt>Status</dt>
              <dd>
                <span className="status">{subscription.status}</span>
              </dd>
              <dt>Plan</dt>
              <dd>{subscription.plan ?? "No active plan"}</dd>
              <dt>Vault access</dt>
              <dd>{subscription.access}</dd>
              <dt>Trial ends</dt>
              <dd>
                {subscription.trialEndsAt
                  ? new Date(subscription.trialEndsAt).toLocaleString()
                  : "Not applicable"}
              </dd>
              <dt>Current period ends</dt>
              <dd>
                {subscription.currentPeriodEndsAt
                  ? new Date(subscription.currentPeriodEndsAt).toLocaleString()
                  : "Not available"}
              </dd>
              <dt>Cancellation</dt>
              <dd>
                {subscription.cancelAtPeriodEnd
                  ? "Scheduled for period end"
                  : "Not scheduled"}
              </dd>
              <dt>Past-due grace</dt>
              <dd>
                {subscription.graceUntil
                  ? new Date(subscription.graceUntil).toLocaleString()
                  : "Not applicable"}
              </dd>
            </dl>
            <div className="actions">
              {subscription.status === "inactive" ||
              subscription.status.startsWith("incomplete") ? (
                <button disabled={busy} onClick={() => void open("checkout")}>
                  Open Stripe checkout
                </button>
              ) : (
                <button disabled={busy} onClick={() => void open("portal")}>
                  Manage billing in Stripe
                </button>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh verified status
              </button>
            </div>
          </>
        ) : (
          <p>Subscription state is loading.</p>
        )}
      </section>
      <section className="card">
        <h2>Entitlements and limits</h2>
        {subscription ? (
          <>
            <ul>
              {Object.entries(subscription.entitlements).map(
                ([name, enabled]) => (
                  <li key={name}>
                    {name}: <strong>{enabled ? "enabled" : "disabled"}</strong>
                  </li>
                ),
              )}
            </ul>
            <p>
              Unapproved numeric limits are shown as “not set,” never invented.
            </p>
            <ul>
              {Object.entries(subscription.quotas).map(([name, value]) => (
                <li key={name}>
                  {name}: <strong>{value ?? "not set"}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
      <section className="card">
        <h2>Refund status</h2>
        {refunds.length ? (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Amount</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((refund) => (
                <tr key={refund.id}>
                  <td data-label="Status">{refund.status}</td>
                  <td data-label="Amount">{formatRefundAmount(refund)}</td>
                  <td data-label="Updated">
                    {new Date(refund.providerUpdatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No refund events are recorded.</p>
        )}
      </section>
      <p className="notice">
        Pricing, taxes, trial terms, renewals, cancellation, refunds, and
        numeric quotas remain subject to approved checkout configuration and
        counsel-reviewed terms. This screen does not fabricate them.
      </p>
    </div>
  );
}
