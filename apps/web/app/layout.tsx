import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HouseholdSwitcher } from "./_components/household-switcher";
import "./styles.css";

export const metadata: Metadata = {
  title: { default: "Legacy Vault", template: "%s | Legacy Vault" },
  description: "Privacy-first household continuity records",
};

const navigation = [
  ["Dashboard", "/dashboard"],
  ["Vault", "/vault"],
  ["Review", "/review"],
  ["Reports", "/reports"],
  ["Export", "/exports"],
  ["Members", "/members"],
  ["Emergency access", "/emergency-access"],
  ["Privacy", "/privacy"],
  ["AI settings", "/ai-settings"],
  ["Security", "/security"],
  ["Billing", "/billing"],
] as const;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <header className="site-header">
          <a className="brand" href="/">
            <span aria-hidden="true">LV</span>
            <span>Legacy Vault</span>
          </a>
          <HouseholdSwitcher />
          <nav aria-label="Primary navigation">
            <ul>
              {navigation.map(([label, href]) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        {children}
        <footer>
          <p>
            Legacy Vault organizes information. It is not legal, medical, tax,
            financial, fiduciary, or emergency advice.
          </p>
          <p>
            <a href="/privacy-notice">Privacy</a> <a href="/terms">Terms</a>{" "}
            <a href="/ai-settings">AI processing</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
