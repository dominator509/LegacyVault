export default function HomePage() {
  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Legacy Vault Concierge</p>
        <h1 id="page-title">
          Keep the facts your household will need within reach.
        </h1>
        <p className="lede">
          Organize evidence-linked records, review what is current, and prepare
          compartmentalized continuity packets. External AI stays off unless you
          make an informed, affirmative choice.
        </p>
        <div className="actions">
          <a className="button" href="/sign-in">
            Sign in or create an account
          </a>
          <a className="button secondary" href="/dashboard">
            Open your dashboard
          </a>
        </div>
      </section>
      <section
        className="grid"
        aria-label="How Legacy Vault protects your records"
      >
        <article className="card">
          <h2>Facts require your review</h2>
          <p>
            Suggested and extracted information remains a candidate until an
            authorized person confirms it.
          </p>
        </article>
        <article className="card">
          <h2>Secrets do not belong here</h2>
          <p>
            Do not enter passwords, PINs, recovery codes, private keys, full
            card numbers, complete Social Security numbers, or safe
            combinations.
          </p>
        </article>
        <article className="card">
          <h2>Access is compartmentalized</h2>
          <p>
            Household roles and emergency releases are bounded by category,
            purpose, review, and audit evidence.
          </p>
        </article>
      </section>
    </main>
  );
}
