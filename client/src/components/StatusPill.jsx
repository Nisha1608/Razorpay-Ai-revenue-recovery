export function StatusPill({ status = "unavailable" }) {
  const value = status.replaceAll("_", " ");
  return <span className={`status-pill status-${status.toLowerCase()}`}>{value}</span>;
}

