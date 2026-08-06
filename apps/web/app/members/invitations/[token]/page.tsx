import type { Metadata } from "next";
import { InvitationAcceptance } from "./invitation-acceptance";
export const metadata: Metadata = { title: "Accept invitation" };
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Household invitation</p>
      <h1>Review and accept access</h1>
      <p>
        Sign in with the same verified email address that received this
        invitation. Acceptance does not grant more access than the assigned
        role.
      </p>
      <InvitationAcceptance token={token} />
    </main>
  );
}
