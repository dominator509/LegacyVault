export function RequestStatus({
  busy,
  error,
  success,
}: {
  busy?: boolean;
  error?: string;
  success?: string;
}) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {busy ? <p className="notice">Working…</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className="success">{success}</p> : null}
    </div>
  );
}
