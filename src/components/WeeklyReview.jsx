import { useMemo } from "react";
import { getWeekStart, normalizeWeeklyReview, WEEKLY_REVIEW_STEPS } from "../lib/kaizenLoop.js";

function StepContext({ data, index }) {
  const openInbox = data.inboxItems.filter((item) => item.status === "open").length;
  const projectIdsWithActions = new Set(data.projectActions.filter((item) => !item.completed).map((item) => item.projectId));
  const projectsWithoutAction = data.projects.filter((project) => !projectIdsWithActions.has(project.id));
  const blocked = [...data.nextActions, ...data.projectActions].filter((action) => action.status === "blocked");
  const messages = [
    `${openInbox} elementi ancora da chiarire.`,
    "Scorri gli eventi passati e raccogli gli impegni rimasti aperti.",
    "Controlla appuntamenti e scadenze delle prossime due settimane.",
    `${projectsWithoutAction.length} progetti senza una prossima azione.`,
    `${blocked.length} azioni bloccate da verificare.`,
    `${data.waitingFor.length} elementi in attesa.`,
    `${data.somedayMaybe.length} possibilità da mantenere, attivare o archiviare.`,
    `${data.experiments.filter((item) => ["active", "review"].includes(item.status)).length} esperimenti attivi o da rivedere.`,
    "Scegli al massimo tre risultati, non una lista completa di task.",
  ];
  return <p className="review-context">{messages[index]}</p>;
}

export default function WeeklyReview({ agentSlot, data, date, onNavigate, onSave }) {
  const weekStart = getWeekStart(date);
  const review = useMemo(
    () => normalizeWeeklyReview(data.weeklyReviews.find((item) => item.weekStart === weekStart) || { weekStart }),
    [data.weeklyReviews, weekStart],
  );
  const completed = new Set(review.completedSteps);
  const currentIndex = Math.min(review.currentStep, WEEKLY_REVIEW_STEPS.length - 1);
  const progress = Math.round((completed.size / WEEKLY_REVIEW_STEPS.length) * 100);

  function patch(value) { onSave(normalizeWeeklyReview({ ...review, ...value })); }
  function toggle(index) {
    const value = String(index);
    const next = new Set(completed);
    if (next.has(value)) next.delete(value); else next.add(value);
    const nextIncomplete = WEEKLY_REVIEW_STEPS.findIndex((_, stepIndex) => !next.has(String(stepIndex)));
    patch({ completedSteps: [...next], currentStep: nextIncomplete === -1 ? 8 : nextIncomplete, status: next.size === WEEKLY_REVIEW_STEPS.length ? "completed" : "in-progress" });
  }
  function outcome(index, value) {
    const outcomes = [...review.nextWeekOutcomes];
    outcomes[index] = value;
    patch({ nextWeekOutcomes: outcomes.filter((item, itemIndex) => item || itemIndex <= index) });
  }

  return (
    <section className="weekly-review" aria-labelledby="weekly-review-title">
      <div className="review-hero"><div><p className="eyebrow">Revisione settimanale</p><h2 id="weekly-review-title">Ritrova affidabilità, un passaggio alla volta</h2><p>Puoi interrompere in qualsiasi momento. Lo stato resta salvato su questo dispositivo e nella sincronizzazione.</p></div><div className="review-progress"><strong>{progress}%</strong><span>{completed.size}/{WEEKLY_REVIEW_STEPS.length}</span></div></div>
      {agentSlot}
      <div className="review-layout">
        <ol className="review-step-list">{WEEKLY_REVIEW_STEPS.map((title, index) => <li className={`${completed.has(String(index)) ? "is-complete" : ""} ${index === currentIndex ? "is-current" : ""}`} key={title}><button aria-current={index === currentIndex ? "step" : undefined} onClick={() => patch({ currentStep: index })} type="button"><span>{completed.has(String(index)) ? "Fatto" : index + 1}</span><strong>{title}</strong></button></li>)}</ol>
        <article className="review-step-detail">
          <p className="eyebrow">Passaggio {currentIndex + 1}</p>
          <h3>{WEEKLY_REVIEW_STEPS[currentIndex]}</h3>
          <StepContext data={data} index={currentIndex} />
          {currentIndex === 0 && <button className="secondary-button" onClick={() => onNavigate("system", "inbox")} type="button">Vai alla Inbox</button>}
          {currentIndex === 3 && <button className="secondary-button" onClick={() => onNavigate("system", "projects")} type="button">Controlla progetti</button>}
          {currentIndex === 7 && <button className="secondary-button" onClick={() => onNavigate("journal", "experiments")} type="button">Apri esperimenti</button>}
          {currentIndex === 8 && <div className="review-outcomes">{[0, 1, 2].map((index) => <label key={index}>Risultato {index + 1}<input onChange={(event) => outcome(index, event.target.value)} placeholder="Un risultato concreto" value={review.nextWeekOutcomes[index] || ""} /></label>)}</div>}
          <label>Note della revisione<textarea onChange={(event) => patch({ notes: event.target.value })} placeholder="Decisioni, elementi da seguire, contesto utile…" value={review.notes} /></label>
          <div className="modal-actions"><button className={`submit-button ${completed.has(String(currentIndex)) ? "is-complete" : ""}`} onClick={() => toggle(currentIndex)} type="button">{completed.has(String(currentIndex)) ? "Segna da rivedere" : "Completa passaggio"}</button></div>
        </article>
      </div>
    </section>
  );
}
