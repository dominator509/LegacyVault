import type { Metadata } from "next";
import { BillingManagement } from "./billing-management";
export const metadata: Metadata = { title: "Billing" };
export default function BillingPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Subscription</p>
      <h1>Billing and plan access</h1>
      <p className="lede">
        Stripe hosts checkout and billing management. A checkout redirect is not
        payment success; Legacy Vault changes access only after a verified,
        ordered Stripe event.
      </p>
      <BillingManagement />
    </main>
  );
}
