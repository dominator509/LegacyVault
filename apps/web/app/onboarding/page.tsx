import type { Metadata } from "next";
import { HouseholdOnboarding } from "./household-onboarding";

export const metadata: Metadata = { title: "Household setup" };
export default function OnboardingPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Household setup</p>
      <h1>Create your first household vault</h1>
      <p className="lede">
        Your display name is encrypted. You can invite collaborators after setup
        and control their roles separately.
      </p>
      <HouseholdOnboarding />
    </main>
  );
}
