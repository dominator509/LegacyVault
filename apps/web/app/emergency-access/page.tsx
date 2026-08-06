import type { Metadata } from "next";
import { EmergencyAccess } from "./emergency-access";
export const metadata: Metadata = { title: "Emergency access" };
export default function EmergencyPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Compartmentalized release</p>
      <h1>Emergency access request</h1>
      <p className="lede">
        A request grants no immediate vault access. Owners review categories,
        receive alerts, and enforce the configured delay before any release.
      </p>
      <EmergencyAccess />
    </main>
  );
}
