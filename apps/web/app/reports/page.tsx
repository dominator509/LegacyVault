import type { Metadata } from "next";
import { ReportGenerator } from "./report-generator";
export const metadata: Metadata = { title: "Reports" };
export default function ReportsPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Evidence-linked outputs</p>
      <h1>Generate a continuity report</h1>
      <p className="lede">
        Reports use confirmed facts and visibly identify missing or disputed
        information. They are informational, not professional advice.
      </p>
      <ReportGenerator />
    </main>
  );
}
