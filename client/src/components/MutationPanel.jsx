import { Check, CirclePlay, ScanSearch } from "lucide-react";

const actions = [
  { key: "analyze", label: "Analyze case", icon: ScanSearch },
  { key: "approve", label: "Approve recovery action", icon: Check },
  { key: "execute", label: "Execute recovery", icon: CirclePlay },
];

export function MutationPanel({ onAction, pending, error, result, caseId, actionId, actionStatus }) {
  const actionIds = { analyze: caseId, approve: actionId, execute: actionId };

  return (
    <section className="action-panel">
      <div className="panel-heading"><div><p className="eyebrow">LIVE BACKEND CONTROLS</p><h2>Case actions</h2></div><Status text="Development API" /></div>
      <p className="panel-copy">Actions use the selected case's persisted state. Payment Links are created for manual sharing; RecoverAI never treats link creation as recovered revenue.</p>
      <div className="action-grid">
        {actions.map(({ key, label, icon: Icon }) => {
          const disabled = pending === key || (key === "analyze" && Boolean(actionId)) || (key === "approve" && actionStatus !== "pending") || (key === "execute" && actionStatus !== "approved");
          return <form className="action-form" key={key} onSubmit={(event) => { event.preventDefault(); onAction(key, actionIds[key], "dashboard-operator"); }}>
            <div className="action-label"><Icon size={16} /> {label}</div>
            <p className="action-status">{key === "analyze" ? actionId ? "Analysis already recorded" : "Generate a policy-reviewed recommendation" : key === "approve" ? actionStatus === "pending" ? "Awaiting operator approval" : `Current state: ${actionStatus || "not available"}` : actionStatus === "approved" ? "Ready to create the Payment Link" : `Current state: ${actionStatus || "not available"}`}</p>
            <button className="control-button" disabled={disabled}>{pending === key ? "Working..." : label}</button>
          </form>
        })}
      </div>
      {error && <p className="feedback error">{error}</p>}
      {result && <p className="feedback success">Action completed. The case now reflects the persisted backend state.</p>}
    </section>
  );
}

function Status({ text }) {
  return <span className="status-pill status-action_pending">{text}</span>;
}
