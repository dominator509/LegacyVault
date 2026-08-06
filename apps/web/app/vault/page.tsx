import type { Metadata } from "next";
import { VaultWorkspace } from "./vault-workspace";
export const metadata: Metadata = { title: "Vault" };
export default function VaultPage() {
  return (
    <main id="main-content">
      <p className="eyebrow">Household vault</p>
      <h1>Records and documents</h1>
      <p className="lede">
        Add non-secret household information as candidate facts. It becomes
        authoritative only after review.
      </p>
      <VaultWorkspace />
    </main>
  );
}
