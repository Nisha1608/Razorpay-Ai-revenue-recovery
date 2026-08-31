import { Activity, ArrowUpRight, Bell, ChevronRight, CircleDollarSign, Menu, ShieldCheck, Sparkles } from "lucide-react";

const metrics = [
  { label: "Revenue at risk", value: "Rs 4,82,900", note: "Across 38 active cases", tone: "amber" },
  { label: "Recovered this month", value: "Rs 1,46,250", note: "+18.4% from last month", tone: "mint" },
  { label: "AI confidence", value: "92.6%", note: "Decision quality score", tone: "blue" },
];

const navItems = ["Overview", "Revenue Risk Queue", "Recovery Timeline", "Audit Trail"];

function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Activity size={18} /></span><span>recover<span>AI</span></span></div>
        <nav aria-label="Primary navigation">
          {navItems.map((item, index) => <button className={index === 0 ? "nav-item active" : "nav-item"} key={item}>{index === 0 ? <CircleDollarSign size={17} /> : <ChevronRight size={17} />}{item}</button>)}
        </nav>
        <div className="policy-card"><ShieldCheck size={19} /><p>Policy engine</p><strong>Operational</strong><span>Every AI action is validated.</span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation"><Menu size={21} /></button>
          <div><p className="eyebrow">MONDAY, 31 AUGUST</p><h1>Revenue recovery, under control.</h1></div>
          <div className="header-actions"><button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button><div className="avatar">AR</div></div>
        </header>

        <section className="hero-card">
          <div><p className="eyebrow"><Sparkles size={14} /> RECOVERY INTELLIGENCE</p><h2>Spot the signal.<br />Recover the revenue.</h2><p className="hero-copy">RecoverAI watches payment failures, chooses the next best action, and leaves a complete audit trail behind.</p><button className="primary-button">Open risk queue <ArrowUpRight size={17} /></button></div>
          <div className="signal-orb"><div className="orb-core"><Activity size={38} /></div><span className="orbit one" /><span className="orbit two" /><span className="signal-label">LIVE<br /><b>38</b> CASES</span></div>
        </section>

        <section className="metrics-grid">
          {metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><p>{metric.label}</p><h3>{metric.value}</h3><span>{metric.note}</span></article>)}
        </section>

        <section className="activity-panel">
          <div className="panel-heading"><div><p className="eyebrow">PRIORITY VIEW</p><h2>Recovery actions awaiting review</h2></div><button className="text-button">View all cases <ArrowUpRight size={16} /></button></div>
          <div className="empty-state"><div className="empty-icon"><CircleDollarSign size={24} /></div><div><h3>Your recovery queue is ready</h3><p>Failed payments and AI recommendations will appear here when the webhook pipeline is connected.</p></div></div>
        </section>
      </section>
    </main>
  );
}

export default App;

