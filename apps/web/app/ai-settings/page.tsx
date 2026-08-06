import type { Metadata } from "next";
import { AiSettings } from "./ai-settings";
export const metadata: Metadata = { title: "AI processing" };
export default function AiSettingsPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Optional external processing</p>
      <h1>DeepSeek processing controls</h1>
      <AiSettings />
    </main>
  );
}
