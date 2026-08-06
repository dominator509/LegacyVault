import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms draft" };
export default function Terms() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Draft — counsel review required</p>
      <h1>Terms of Service</h1>
      <p className="notice">
        These terms are not approved for production acceptance. Pricing, entity
        details, liability, indemnity, governing law, disputes, insurance, and
        consumer-law language require counsel and business evidence.
      </p>
      <section className="card">
        <h2>Service boundary</h2>
        <p>
          Legacy Vault provides organizational software, document processing,
          optional AI assistance, reminders, collaboration, and informational
          packets. It is not a law firm, fiduciary, executor, trustee, tax or
          financial adviser, insurer, healthcare provider, emergency service, or
          password manager.
        </p>
        <h2>Your responsibilities</h2>
        <p>
          You must be at least 18, protect authentication factors, have
          authority for uploaded content, review facts and permissions, and
          consult qualified professionals for advice or legally effective
          documents.
        </p>
        <h2>Optional AI</h2>
        <p>
          AI may be unavailable or wrong. It is used only after disclosed
          consent and produces suggestions, never automatically confirmed facts
          or legal instruments.
        </p>
        <h2>Emergency access</h2>
        <p>
          The workflow does not guarantee delivery, identity, capacity,
          entitlement, or legal effect. Releases remain bounded, delayed,
          reviewable, and auditable.
        </p>
        <h2>Billing and deletion</h2>
        <p>
          Stripe handles payments. Cancellation stops future renewal according
          to approved checkout terms; it does not delete records. Deletion is a
          separate privacy workflow.
        </p>
      </section>
    </main>
  );
}
