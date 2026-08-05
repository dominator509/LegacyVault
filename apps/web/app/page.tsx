export default function HomePage() {
  return (
    <main>
      <section aria-labelledby="page-title">
        <p className="eyebrow">Legacy Vault</p>
        <h1 id="page-title">Keep the facts your household will need within reach.</h1>
        <p>
          Organize evidence-linked records, review what is current, and prepare compartmentalized
          continuity packets. External AI remains off until you make an informed choice.
        </p>
        <a className="primary-action" href="#safety">
          Review how it works
        </a>
      </section>
      <section id="safety" aria-labelledby="safety-title">
        <h2 id="safety-title">You stay in control</h2>
        <p>
          Suggested facts are never confirmed automatically. Legacy Vault does not store passwords,
          recovery codes, private keys, full card numbers, or complete Social Security numbers.
        </p>
      </section>
    </main>
  );
}
