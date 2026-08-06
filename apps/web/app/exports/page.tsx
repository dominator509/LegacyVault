import type { Metadata } from "next";
import { PortableExport } from "./portable-export";
export const metadata: Metadata = { title: "Portable export" };
export default function ExportPage() {
  return (
    <main id="main-content" className="narrow">
      <p className="eyebrow">Portable household copy</p>
      <h1>Create an encrypted export</h1>
      <p className="lede">
        The archive contains household data and documents you are authorized to
        export. Keep its one-time key separate from the downloaded archive.
      </p>
      <PortableExport />
    </main>
  );
}
