import { describe, expect, it } from "vitest";
import { DockerOcrMyPdfAdapter } from "../../packages/documents/src/index.js";

const image =
  "jbarlow83/ocrmypdf:v17.8.1@sha256:0563a68359fe4e68022974103794a69d5d37270686f99c9030a7667ebbb639d4";

function imageOnlyPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 35 >>\nstream\nq\n200 0 0 200 0 0 cm\n/Im0 Do\nQ\nendstream",
    "<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 9 >>\nstream\n00FFFFFF>\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function blankPdf(pageCount: number): Buffer {
  const pageObjects = Array.from(
    { length: pageCount },
    (_, index) =>
      `${index + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] >>\nendobj\n`,
  );
  const children = Array.from(
    { length: pageCount },
    (_, index) => `${index + 3} 0 R`,
  ).join(" ");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    `2 0 obj\n<< /Type /Pages /Kids [${children}] /Count ${pageCount} >>\nendobj\n`,
    ...pageObjects,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

describe("real isolated OCRmyPDF runtime", () => {
  it("processes an image-only PDF without network or writable root access", async () => {
    const adapter = new DockerOcrMyPdfAdapter({
      dockerExecutable: "docker",
      image,
      timeoutMs: 120_000,
    });
    const output = await adapter.extractSearchablePdf(imageOnlyPdf());
    expect(Buffer.from(output.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    expect(output.byteLength).toBeGreaterThan(100);
  }, 130_000);

  it("normalizes and processes a supported raster image with bomb limits", async () => {
    const adapter = new DockerOcrMyPdfAdapter({
      dockerExecutable: "docker",
      image,
      timeoutMs: 120_000,
    });
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALklEQVR4nO3OMQEAAAjDsIF/z0MGT2qgmbb5bF/vAAAAAAAAAAAAAAAAAAAASQ5AtAM9yMAItAAAAABJRU5ErkJggg==",
      "base64",
    );
    const output = await adapter.extractSearchablePdf(onePixelPng, "image/png");
    expect(Buffer.from(output.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    expect(output.byteLength).toBeGreaterThan(100);
  }, 130_000);

  it("rejects a document above the configured page limit before OCR", async () => {
    const adapter = new DockerOcrMyPdfAdapter({
      dockerExecutable: "docker",
      image,
      timeoutMs: 120_000,
    });
    await expect(adapter.extractSearchablePdf(blankPdf(101))).rejects.toThrow(
      /page limit/,
    );
  }, 130_000);
});
