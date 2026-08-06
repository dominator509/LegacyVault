import type { Metadata } from "next";
import { FactReview } from "./fact-review";
export const metadata: Metadata = { title: "Fact review" };
export default function ReviewPage() {
  return (
    <main id="main-content">
      <p className="eyebrow">Evidence review</p>
      <h1>Confirm, edit, or reject suggested facts</h1>
      <p className="lede">
        Confidence is not verification. Compare each candidate with its source
        before accepting it.
      </p>
      <FactReview />
    </main>
  );
}
