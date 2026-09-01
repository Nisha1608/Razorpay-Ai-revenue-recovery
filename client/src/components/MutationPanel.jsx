import { Check, CirclePlay, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";

const actions = [
  { key: "analyze", label: "Analyze case", icon: ScanSearch, placeholder: "Recovery case ID" },
  { key: "approve", label: "Approve action", icon: Check, placeholder: "Recovery action ID" },
  { key: "execute", label: "Execute action", icon: CirclePlay, placeholder: "Recovery action ID" },
];

export function MutationPanel({ onAction, pending, error, result, caseId, actionId }) {
  const [ids, setIds] = useState({ analyze: "", approve: "", execute: "" });
  const [approvedBy, setApprovedBy] = useState("dashboard-operator");

  useEffect(() => {
    setIds({ analyze: caseId || "", approve: actionId || "", execute: actionId || "" });
  }, [caseId, actionId]);

  return (
    <section className="action-panel">
      <div className="panel-heading"><div><p className="eyebrow">LIVE BACKEND CONTROLS</p><h2>Case actions</h2></div><Status text="Development API" /></div>
      <p className="panel-copy">Controls are prefilled from the selected case. They call the existing recovery APIs and never calculate or simulate a payment outcome.</p>
      <div className="action-grid">
        {actions.map(({ key, label, icon: Icon, placeholder }) => (
          <form className="action-form" key={key} onSubmit={(event) => { event.preventDefault(); onAction(key, ids[key], approvedBy); }}>
            <div className="action-label"><Icon size={16} /> {label}</div>
            <input value={ids[key]} onChange={(event) => setIds({ ...ids, [key]: event.target.value })} placeholder={placeholder} aria-label={placeholder} required />
            {key === "approve" && <input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} placeholder="Approved by" aria-label="Approved by" required />}
            <button className="control-button" disabled={pending === key}>{pending === key ? "Working..." : label}</button>
          </form>
        ))}
      </div>
      {error && <p className="feedback error">{error}</p>}
      {result && <pre className="result-view">{JSON.stringify(result, null, 2)}</pre>}
    </section>
  );
}

function Status({ text }) {
  return <span className="status-pill status-action_pending">{text}</span>;
}
