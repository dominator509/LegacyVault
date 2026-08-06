import type { Metadata } from "next";
import { PrivacyRights } from "./privacy-rights";
export const metadata: Metadata = { title: "Privacy rights" };
export default function PrivacyPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Your data choices</p>
      <h1>Privacy requests and deletion review</h1>
      <p className="lede">
        Access, correction, export, deletion, and appeal requests receive a
        durable status workflow. Deletion is separate from subscription
        cancellation.
      </p>
      <PrivacyRights />
    </main>
  );
}
