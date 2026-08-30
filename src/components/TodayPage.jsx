import { useMemo, useState } from "react";
import BottomNav from "./BottomNav.jsx";
import ClarifyInboxModal from "./ClarifyInboxModal.jsx";
import CompactAgenda from "./CompactAgenda.jsx";
import DailyFocus from "./DailyFocus.jsx";
import UnifiedActions from "./UnifiedActions.jsx";
import AgentAssist from "./AgentAssist.jsx";
import { formatDisplayDate } from "../utils/date.js";
import { getDailyPlan, selectUnifiedActions } from "../lib/kaizenLoop.js";

export default function TodayPage({ activeSection, data, date, onActionDelete, onActionOrder, onActionSave, onAddInboxItem, onClarifyInboxItem, onDeleteCalendarItem, onNavigate, onSaveAgentInsight, onSaveCalendarItem, onSaveDailyPlan, onToggleAction }) {
  const [captureText, setCaptureText] = useState("");
  const [captureFeedback, setCaptureFeedback] = useState("");
  const [clarifyingItem, setClarifyingItem] = useState(null);
  const [showInbox, setShowInbox] = useState(false);
  const allActions = useMemo(() => selectUnifiedActions(data, { includeCompleted: true }), [data]);
  const actions = useMemo(() => allActions.filter((action) => !action.completed), [allActions]);
  const plan = useMemo(() => getDailyPlan(data.dailyPlans, date), [data.dailyPlans, date]);
  const openInbox = useMemo(() => data.inboxItems.filter((item) => item.status === "open"), [data.inboxItems]);

  function capture(event) {
    event.preventDefault();
    if (!captureText.trim()) return;
    onAddInboxItem(captureText);
    setCaptureText("");
    setCaptureFeedback("Salvato nella Inbox");
    window.setTimeout(() => setCaptureFeedback(""), 1800);
  }

  return (
    <div className="app-shell">
      <main className="page today-page">
        <header className="topbar compact-topbar"><div><p className="eyebrow">{formatDisplayDate(date)}</p><h1>Oggi</h1></div><p className="brand-mark">Kaizen Loop</p></header>

        <section className="panel capture-panel" aria-labelledby="capture-title">
          <div className="capture-heading"><div><p className="eyebrow">Cattura rapida</p><h2 id="capture-title">Togli qualcosa dalla mente</h2></div><button className="inbox-link" onClick={() => setShowInbox((value) => !value)} type="button">{openInbox.length} da chiarire</button></div>
          <form className="quick-capture" onSubmit={capture}><label className="sr-only" htmlFor="quick-capture-input">Aggiungi alla Inbox</label><input autoComplete="off" enterKeyHint="send" id="quick-capture-input" onChange={(event) => setCaptureText(event.target.value)} placeholder="Scrivi e invia alla Inbox…" value={captureText} /><button className="add-button capture-submit" disabled={!captureText.trim()} type="submit">Cattura</button></form>
          <p className="save-feedback" role="status" aria-live="polite">{captureFeedback}</p>
          {showInbox && <div className="inline-inbox">{openInbox.length ? <ul className="simple-list">{openInbox.map((item) => <li key={item.id}><button onClick={() => setClarifyingItem(item)} type="button"><strong>{item.originalText}</strong><span>Chiarisci</span></button></li>)}</ul> : <p className="empty-state compact-empty">Inbox vuota. Non serve fare altro.</p>}<button className="secondary-button compact-button" onClick={() => onNavigate("system", "inbox")} type="button">Apri Inbox nel Sistema</button></div>}
        </section>

        <DailyFocus actions={allActions} agentSlot={<AgentAssist data={data} date={date} mode="focus" onSaveInsight={onSaveAgentInsight} title="Supporto al Focus" />} onChange={onSaveDailyPlan} onToggleAction={onToggleAction} plan={plan} />
        <CompactAgenda items={data.calendarItems} onDeleteItem={onDeleteCalendarItem} onSaveItem={onSaveCalendarItem} today={date} />
        <UnifiedActions actions={actions} onDelete={onActionDelete} onMoveOrder={onActionOrder} onSave={onActionSave} onToggle={onToggleAction} projects={data.projects} />

        <section className="panel inbox-status-panel"><div><p className="eyebrow">Inbox</p><h2>{openInbox.length ? `${openInbox.length} element${openInbox.length === 1 ? "o" : "i"} da chiarire` : "Inbox in ordine"}</h2></div><button className="secondary-button" onClick={() => onNavigate("system", "inbox")} type="button">{openInbox.length ? "Chiarisci ora" : "Apri Inbox"}</button></section>
        <section className="panel day-close-panel"><div><p className="eyebrow">Chiusura</p><h2>Lascia una traccia della giornata</h2><p>Annota ciò che conta; la pianificazione di domani può aspettare.</p></div><button className="submit-button" onClick={() => onNavigate("journal", "today")} type="button">Apri journal serale</button></section>
      </main>
      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />
      {clarifyingItem && <ClarifyInboxModal item={clarifyingItem} onClose={() => setClarifyingItem(null)} onSubmit={async (result) => { await onClarifyInboxItem(clarifyingItem.id, result); setClarifyingItem(null); }} projects={data.projects} today={date} />}
    </div>
  );
}
