import { Activity, ArrowRight, Bell, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Gauge, GitBranch, Menu, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { MutationPanel } from "./components/MutationPanel.jsx";
import { StatusPill } from "./components/StatusPill.jsx";
import { recoverAiApi } from "./services/api.js";

const navItems = [
  { label: "Overview", icon: Gauge },
  { label: "Recovery Queue", icon: ClipboardList },
  { label: "Case Detail", icon: CircleDollarSign },
  { label: "Recovery Timeline", icon: GitBranch },
  { label: "Audit Trail", icon: ClipboardList },
];

const initialResource = { loading: false, data: null, error: "" };

function formatCurrency(paise) {
  return typeof paise === "number" ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100) : "--";
}

function formatPercent(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "--";
}

function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return "--";
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "--";
}

function label(value) {
  return value ? value.replaceAll("_", " ") : "Not recorded";
}

function activeAction(recoveryCase) {
  return recoveryCase?.activeAction || recoveryCase?.recommendedAction || null;
}

function App() {
  const [page, setPage] = useState("Overview");
  const [health, setHealth] = useState({ loading: true });
  const [metrics, setMetrics] = useState(initialResource);
  const [queue, setQueue] = useState(initialResource);
  const [detail, setDetail] = useState(initialResource);
  const [audit, setAudit] = useState(initialResource);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "", action: "", sortBy: "createdAt", sortOrder: "desc", page: 1, limit: 10 });
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function refreshHealth() {
    setHealth({ loading: true });
    try { setHealth({ data: await recoverAiApi.health(), loading: false }); } catch (requestError) { setHealth({ error: requestError.message, loading: false }); }
  }

  useEffect(() => { refreshHealth(); }, []);

  async function loadMetrics() {
    setMetrics((state) => ({ ...state, loading: true, error: "" }));
    try { setMetrics({ data: await recoverAiApi.metrics(), loading: false, error: "" }); } catch (requestError) { setMetrics({ data: null, loading: false, error: requestError.message }); }
  }

  async function loadQueue(nextFilters = filters) {
    setQueue((state) => ({ ...state, loading: true, error: "" }));
    try { setQueue({ data: await recoverAiApi.recoveryCases(nextFilters), loading: false, error: "" }); } catch (requestError) { setQueue({ data: null, loading: false, error: requestError.message }); }
  }

  async function loadCase(recoveryCaseId = selectedCaseId) {
    if (!recoveryCaseId) return;
    setDetail((state) => ({ ...state, loading: true, error: "" }));
    try { setDetail({ data: await recoverAiApi.recoveryCase(recoveryCaseId), loading: false, error: "" }); } catch (requestError) { setDetail({ data: null, loading: false, error: requestError.message }); }
  }

  async function loadAudit(recoveryCaseId = selectedCaseId) {
    if (!recoveryCaseId) return;
    setAudit((state) => ({ ...state, loading: true, error: "" }));
    try { setAudit({ data: await recoverAiApi.audit(recoveryCaseId), loading: false, error: "" }); } catch (requestError) { setAudit({ data: null, loading: false, error: requestError.message }); }
  }

  useEffect(() => { loadMetrics(); }, []);
  useEffect(() => { if (page === "Recovery Queue") loadQueue(); }, [page, filters]);
  useEffect(() => { if (selectedCaseId && ["Case Detail", "Recovery Timeline", "Audit Trail"].includes(page)) { loadCase(); loadAudit(); } }, [page, selectedCaseId]);

  async function runAction(type, id, approvedBy) {
    setPending(type); setError(""); setResult(null);
    try {
      const response = type === "analyze" ? await recoverAiApi.analyze(id) : type === "approve" ? await recoverAiApi.approve(id, approvedBy) : await recoverAiApi.execute(id);
      setResult(response);
      await Promise.all([loadMetrics(), loadQueue(), loadCase(), loadAudit()]);
    } catch (requestError) { setError(requestError.message); } finally { setPending(""); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Activity size={18} /></span><span>recover<span>AI</span></span></div>
        <nav aria-label="Primary navigation">
          {navItems.map(({ label, icon: Icon }) => <button className={page === label ? "nav-item active" : "nav-item"} onClick={() => setPage(label)} key={label}><Icon size={17} />{label}</button>)}
        </nav>
        <div className="policy-card"><ShieldCheck size={19} /><p>Policy engine</p><strong>Operational</strong><span>Every AI action is validated.</span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation"><Menu size={21} /></button>
          <div><p className="eyebrow">RECOVERY OPERATIONS</p><h1>{page}</h1></div>
          <div className="header-actions"><button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button><div className="avatar">AR</div></div>
        </header>
        {page === "Overview" && <Overview health={health} metrics={metrics} onRefresh={() => { refreshHealth(); loadMetrics(); }} />}
        {page === "Recovery Queue" && <Queue queue={queue} filters={filters} onFilters={setFilters} onSelect={(id) => { setSelectedCaseId(id); setPage("Case Detail"); }} onRetry={loadQueue} />}
        {page === "Case Detail" && <CaseDetail detail={detail} audit={audit} pending={pending} error={error} result={result} onAction={runAction} onRetry={() => { loadCase(); loadAudit(); }} />}
        {page === "Recovery Timeline" && <TimelinePage audit={audit} selectedCaseId={selectedCaseId} onRetry={loadAudit} />}
        {page === "Audit Trail" && <AuditTrail audit={audit} selectedCaseId={selectedCaseId} onRetry={loadAudit} />}
      </section>
    </main>
  );
}

function Overview({ health, metrics, onRefresh }) {
  const metricCards = metrics.data ? [
    ["Revenue at risk", formatCurrency(metrics.data.revenueAtRisk)], ["Revenue recovered", formatCurrency(metrics.data.revenueRecovered)], ["Recovery rate", formatPercent(metrics.data.recoveryRate)],
    ["Active cases", metrics.data.activeRecoveryCases], ["Successful recoveries", metrics.data.successfulActions], ["Average recovery time", formatDuration(metrics.data.averageRecoveryTime)],
  ] : [];
  return <>
    <section className="hero-card"><div><p className="eyebrow"><Sparkles size={14} /> VERIFIED OPERATIONS</p><h2>AI recommends.<br />Policy holds the line.</h2><p className="hero-copy">Every number below comes from persisted RecoverAI case, action, and payment state.</p></div><div className="service-status"><CheckCircle2 size={23} /><strong>{health.loading ? "Checking API" : health.data ? "API online" : "API unavailable"}</strong><span>{health.data?.service || health.error || "Connecting to RecoverAI"}</span><button className="text-button" onClick={onRefresh}><RefreshCw size={14} /> Refresh</button></div></section>
    <ResourceState resource={metrics} onRetry={onRefresh}>{() => <section className="metrics-grid">{metricCards.map(([name, value]) => <article className="metric-card" key={name}><p>{name}</p><h3>{value}</h3><span>Confirmed server value</span></article>)}</section>}</ResourceState>
  </>;
}

function Queue({ queue, filters, onFilters, onSelect, onRetry }) {
  const update = (key, value) => onFilters({ ...filters, [key]: value, page: key === "page" ? value : 1 });
  const cases = queue.data?.data || [];
  return <><section className="filter-bar"><input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="Search customer, email, or phone" /><select value={filters.status} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{["open", "analyzing", "action_pending", "executing", "recovered", "closed"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><select value={filters.action} onChange={(event) => update("action", event.target.value)}><option value="">All actions</option>{["RETRY_PAYMENT", "CREATE_PAYMENT_LINK", "SEND_REMINDER", "OFFER_ALTERNATIVE_PAYMENT", "ESCALATE_TO_HUMAN", "DO_NOTHING"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><select value={filters.sortBy} onChange={(event) => update("sortBy", event.target.value)}><option value="createdAt">Newest first</option><option value="amount">Amount</option><option value="riskScore">Risk score</option><option value="status">Status</option></select><button className="icon-button" onClick={() => update("sortOrder", filters.sortOrder === "asc" ? "desc" : "asc")} aria-label="Reverse sort"><ArrowRight size={16} /></button></section><ResourceState resource={queue} onRetry={onRetry}>{() => cases.length ? <><div className="table-wrap"><table><thead><tr>{["Customer", "Amount", "Risk", "Analysis confidence", "Failure reason", "Recommended action", "Priority", "Status"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{cases.map((recoveryCase) => { const action = activeAction(recoveryCase); return <tr key={recoveryCase._id} onClick={() => onSelect(recoveryCase._id)}><td><strong>{recoveryCase.customer?.name || recoveryCase.customer?.email || "Unknown customer"}</strong><small>{recoveryCase.customer?.email || recoveryCase.customer?.phone || "No contact"}</small></td><td>{formatCurrency(recoveryCase.payment?.amount)}</td><td>{recoveryCase.riskScore ?? "--"}</td><td>{formatPercent(recoveryCase.aiAnalysis?.confidence)}</td><td>{recoveryCase.payment?.failureReason || "--"}</td><td>{label(action?.type)}</td><td>Not recorded</td><td><StatusPill status={recoveryCase.status} /></td></tr>; })}</tbody></table></div><Pagination pagination={queue.data.pagination} onPage={(page) => update("page", page)} /></> : <EmptyState message="No recovery cases found." />}</ResourceState></>;
}

function CaseDetail({ detail, audit, pending, error, result, onAction, onRetry }) {
  if (!detail.data && !detail.loading && !detail.error) return <EmptyState message="Select a recovery case from the Recovery Queue to view its details." />;
  return <ResourceState resource={detail} onRetry={onRetry}>{() => { const { recoveryCase, customer, payment, action, aiAnalysis, policyEvaluation, execution } = detail.data; return <><section className="detail-intro"><StatusPill status={recoveryCase.status} /><h2>{customer?.name || customer?.email || "Recovery case"}</h2><p>Case ID: <code>{recoveryCase._id}</code></p></section><section className="detail-grid"><InfoCard title="Customer" values={[["Email", customer?.email], ["Phone", customer?.phone], ["Successful payments", customer?.successfulPayments], ["Failed payments", customer?.failedPayments]]} /><InfoCard title="Payment" values={[["Amount", formatCurrency(payment?.amount)], ["Method", payment?.method], ["Failure", payment?.failureReason], ["Payment status", payment?.status]]} /><InfoCard title="AI analysis" values={[["Risk score", recoveryCase.riskScore], ["Analysis confidence", formatPercent(aiAnalysis?.confidence)], ["Diagnosis", aiAnalysis?.summary], ["Recovery probability", "Not recorded"]]} /><InfoCard title="Policy & action" values={[["Recommended action", action?.type], ["Action status", action?.status], ["Policy", policyEvaluation?.allowed === undefined ? "Not evaluated" : policyEvaluation.allowed ? "Allowed" : "Blocked"], ["Reason", policyEvaluation?.reason]]} /><InfoCard title="Execution" values={[["Provider reference", execution?.providerReference], ["Payment link", execution?.metadata?.paymentLinkShortUrl], ["Executed", formatDate(execution?.executedAt)], ["Reference ID", execution?.metadata?.referenceId]]} /></section><MutationPanel pending={pending} error={error} result={result} onAction={onAction} caseId={recoveryCase._id} actionId={action?._id} /><Timeline entries={audit.data?.data || []} /></>; }}</ResourceState>;
}

function TimelinePage({ audit, selectedCaseId, onRetry }) { if (!selectedCaseId) return <EmptyState message="Select a recovery case from the Recovery Queue to view its timeline." />; return <ResourceState resource={audit} onRetry={onRetry}>{() => <Timeline entries={audit.data?.data || []} />}</ResourceState>; }
function AuditTrail({ audit, selectedCaseId, onRetry }) { if (!selectedCaseId) return <EmptyState message="Select a recovery case from the Recovery Queue to view its audit trail." />; return <ResourceState resource={audit} onRetry={onRetry}>{() => { const entries = audit.data?.data || []; return entries.length ? <section className="table-wrap audit-table"><table><thead><tr><th>Timestamp</th><th>Actor</th><th>Event</th><th>Action</th><th>Reason</th><th>Policy result</th><th>Metadata</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry._id}><td>{formatDate(entry.createdAt)}</td><td><StatusPill status={entry.actor} /></td><td>{label(entry.eventType)}</td><td>{label(entry.action?.type)}</td><td>{entry.message}</td><td>{entry.after?.allowed === undefined ? "--" : entry.after.allowed ? "Allowed" : "Blocked"}</td><td><code>{entry.metadata ? JSON.stringify(entry.metadata) : "--"}</code></td></tr>)}</tbody></table></section> : <EmptyState message="No audit events found for this recovery case." />; }}</ResourceState>; }

function Timeline({ entries }) { return <section className="timeline-panel"><div className="panel-heading"><div><p className="eyebrow">VERIFIED EVENT SEQUENCE</p><h2>Recovery timeline</h2></div></div>{entries.length ? <ol className="timeline-list">{entries.map((entry) => <li key={entry._id}><span className="timeline-dot" /><div><p>{label(entry.eventType)}</p><strong>{entry.message}</strong><small>{formatDate(entry.createdAt)} · {entry.actor}</small></div></li>)}</ol> : <EmptyState message="No timeline events found for this recovery case." />}</section>; }
function InfoCard({ title, values }) { return <section className="info-card"><p className="eyebrow">{title}</p>{values.map(([name, value]) => <div className="info-row" key={name}><span>{name}</span>{value?.startsWith?.("http") ? <a href={value} target="_blank" rel="noreferrer">Open link</a> : <strong>{value ?? "--"}</strong>}</div>)}</section>; }
function EmptyState({ message }) { return <section className="empty-state"><div className="empty-icon"><CircleDollarSign size={24} /></div><div><h3>{message}</h3><p>RecoverAI only renders confirmed backend data.</p></div></section>; }
function ResourceState({ resource, onRetry, children }) { if (resource.loading) return <section className="loading-state">Loading verified recovery data...</section>; if (resource.error) return <section className="feedback error">{resource.error}<button className="text-button" onClick={onRetry}>Retry</button></section>; return children(); }
function Pagination({ pagination, onPage }) { if (!pagination || pagination.totalPages <= 1) return null; return <div className="pagination"><button onClick={() => onPage(pagination.page - 1)} disabled={pagination.page === 1}><ChevronLeft size={16} /> Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button onClick={() => onPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}>Next <ChevronRight size={16} /></button></div>; }

export default App;
