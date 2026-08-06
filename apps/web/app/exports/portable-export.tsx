"use client";
import { useEffect, useState } from "react";
import { apiRequest, errorMessage, mutationHeaders } from "../_lib/api-client";
import { RequestStatus } from "../_components/request-status";
function base64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
interface ExportState {
  id: string;
  status: string;
  version: number;
  archiveSha256?: string;
  signerPublicKey?: string;
  downloadUrl?: string;
  downloadExpiresInSeconds?: number;
}
export function PortableExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [exportKey, setExportKey] = useState<Uint8Array | null>(null);
  useEffect(
    () => () => {
      exportKey?.fill(0);
    },
    [exportKey],
  );
  async function start() {
    setBusy(true);
    setError("");
    setSuccess("");
    const key = crypto.getRandomValues(new Uint8Array(32));
    try {
      const result = await apiRequest<{ export: ExportState }>("/v1/exports", {
        method: "POST",
        headers: mutationHeaders(0),
        body: JSON.stringify({ exportKeyBase64: base64(key) }),
      });
      setExportKey((previous) => {
        previous?.fill(0);
        return key;
      });
      setExportState(result.export);
      setSuccess(
        "Encrypted export queued. Save the key now; Legacy Vault will not place it in the archive.",
      );
    } catch (c) {
      key.fill(0);
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!exportState) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<ExportState>(
        `/v1/exports/${exportState.id}`,
      );
      setExportState(result);
      setSuccess(`Export status: ${result.status}.`);
    } catch (c) {
      setError(errorMessage(c));
    } finally {
      setBusy(false);
    }
  }
  function saveKey() {
    if (!exportKey) return;
    const blob = new Blob([`Legacy Vault export key\n${base64(exportKey)}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `legacy-vault-export-${exportState?.id ?? "pending"}.key.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function safeDownload() {
    if (!exportState?.downloadUrl) return;
    const url = new URL(exportState.downloadUrl);
    if (
      url.protocol !== "https:" &&
      url.hostname !== "127.0.0.1" &&
      url.hostname !== "localhost"
    ) {
      setError("The export download URL is not trusted.");
      return;
    }
    window.location.assign(url.toString());
  }
  return (
    <div className="stack">
      <section className="card primary-card">
        <h2>Start export</h2>
        <p className="notice">
          The generated key protects the archive. Anyone with both files may be
          able to read the export. Do not email them together or store the key
          in the vault.
        </p>
        <button disabled={busy} onClick={() => void start()}>
          Generate key and start encrypted export
        </button>
        {exportKey ? (
          <div className="stack">
            <p>
              <strong>One-time export key:</strong>{" "}
              <code>{base64(exportKey)}</code>
            </p>
            <button className="secondary" onClick={saveKey}>
              Save key file
            </button>
          </div>
        ) : null}
      </section>
      {exportState ? (
        <section className="card">
          <h2>Export status</h2>
          <dl>
            <dt>Status</dt>
            <dd>
              <span className="status">{exportState.status}</span>
            </dd>
            <dt>Archive SHA-256</dt>
            <dd>
              <code>
                {exportState.archiveSha256 ?? "Available after completion"}
              </code>
            </dd>
            <dt>Signer public key</dt>
            <dd>
              <code>
                {exportState.signerPublicKey ?? "Available after completion"}
              </code>
            </dd>
          </dl>
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Refresh status
            </button>
            {exportState.status === "completed" && exportState.downloadUrl ? (
              <button onClick={safeDownload}>Download encrypted archive</button>
            ) : null}
          </div>
          {exportState.downloadExpiresInSeconds ? (
            <p className="field-help">
              Download link expires in {exportState.downloadExpiresInSeconds}{" "}
              seconds.
            </p>
          ) : null}
        </section>
      ) : null}
      <RequestStatus busy={busy} error={error} success={success} />
    </div>
  );
}
