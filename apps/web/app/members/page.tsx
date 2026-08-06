import type { Metadata } from "next";
import { MemberAdministration } from "./member-administration";
export const metadata: Metadata = { title: "Household members" };
export default function MembersPage() {
  return (
    <main id="main-content">
      <p className="eyebrow">Collaborator access</p>
      <h1>Household members and invitations</h1>
      <p className="lede">
        Invite only people authorized to see household information. Review roles
        and revoke unused invitations promptly.
      </p>
      <MemberAdministration />
    </main>
  );
}
