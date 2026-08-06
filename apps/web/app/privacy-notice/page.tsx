import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy notice" };
export default function PrivacyNotice() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Draft — counsel review required</p>
      <h1>Privacy notice</h1>
      <p className="notice">
        This draft is not approved for production publication. The legal entity,
        address, effective date, contacts, processing countries, vendor terms,
        and retention periods remain release-blocking evidence.
      </p>
      <section className="card">
        <h2>What Legacy Vault handles</h2>
        <p>
          Account, household, document and record metadata, user-provided
          continuity information, consents, privacy requests, subscription
          metadata, security records, and redacted diagnostics needed to provide
          and protect the service.
        </p>
        <h2>What does not belong in the vault</h2>
        <p>
          Passwords, PINs, seed phrases, private keys, recovery codes, complete
          card numbers, complete Social Security numbers, and safe combinations
          are blocked.
        </p>
        <h2>Your choices</h2>
        <p>
          You can manage collaborators, keep external AI off, withdraw future AI
          consent, request access, correction, export, deletion, or appeal, and
          review a durable request ledger.
        </p>
        <h2>AI and subprocessors</h2>
        <p>
          DeepSeek processing is optional and limited to selected, minimized
          categories after affirmative consent. Provider locations, retention,
          secondary use, and deletion terms remain unknown pending verified
          evidence. See the <a href="/ai-settings">AI Processing Notice</a> and
          repository-controlled subprocessor register.
        </p>
        <h2>Emergency access</h2>
        <p>
          Owners define recipients and categories. Requests create alerts and a
          delay; Legacy Vault does not make legal entitlement or capacity
          decisions.
        </p>
      </section>
    </main>
  );
}
