import { DatabaseZap } from "lucide-react";

export function UnavailablePanel({ title, endpoint, description }) {
  return (
    <section className="unavailable-panel">
      <div className="unavailable-icon"><DatabaseZap size={22} /></div>
      <div>
        <p className="eyebrow">BACKEND READ API REQUIRED</p>
        <h3>{title}</h3>
        <p>{description}</p>
        <code>{endpoint}</code>
      </div>
    </section>
  );
}

