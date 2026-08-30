import { useState } from "react";
import { buildAgentContext, requestKaizenAgent } from "../lib/kaizenLoop.js";

const MODE_COPY = {
  "gtd-clarification": "Invia titoli e metadati essenziali dell'inventario, senza Oneiros.",
  focus: "Invia azioni disponibili, piano odierno e strategie personali, senza decidere le priorità al posto tuo.",
  "weekly-review": "Invia lo stato essenziale di Inbox, progetti, azioni ed esperimenti, senza Oneiros.",
};

export default function AgentAssist({ data, date, mode, onSaveInsight, title }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const insight = [...(data.agentInsights || [])]
    .filter((item) => item.date === date && item.mode === mode)
    .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""))[0];

  async function analyze() {
    setWorking(true);
    setError("");
    try {
      const context = buildAgentContext({ data, date, includeDreams: false, mode });
      const analysis = await requestKaizenAgent(context);
      onSaveInsight({
        id: `agent-${mode}:${date}:${Date.now()}`,
        date,
        mode,
        includeDreams: false,
        inputRefs: context.actions.map((action) => action.ref),
        ...analysis,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (analysisError) {
      setError(analysisError.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <aside className="agent-assist">
      <button aria-expanded={open} className="agent-assist-toggle" onClick={() => setOpen((value) => !value)} type="button">
        <span>Agente Kaizen</span><strong>{title}</strong>
      </button>
      {open && <div className="agent-assist-body">
        <p>{MODE_COPY[mode]}</p>
        <button className="secondary-button compact-button" disabled={working} onClick={analyze} type="button">{working ? "Preparazione…" : "Avvia su richiesta"}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        {insight && <div className="agent-assist-result"><strong>{insight.summary}</strong>{(insight.statements || []).slice(0, 3).map((statement, index) => <p key={`${statement.type}-${index}`}><span>{statement.type}</span>{statement.text}</p>)}</div>}
      </div>}
    </aside>
  );
}
