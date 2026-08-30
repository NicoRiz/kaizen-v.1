import { resolveDailyFocus } from "../lib/kaizenLoop.js";

function FocusRow({ action, label, onComplete, onRemove, onSwap, options, support = false }) {
  if (!action) {
    return (
      <label className="focus-picker">
        <span>{label}</span>
        <select onChange={(event) => onSwap(event.target.value)} value="">
          <option value="">Scegli dall'inventario…</option>
          {options.map((item) => <option key={item.ref} value={item.ref}>{item.title}{item.projectTitle ? ` · ${item.projectTitle}` : ""}</option>)}
        </select>
      </label>
    );
  }

  return (
    <article className={`focus-action ${support ? "focus-action--support" : "focus-action--primary"}`}>
      <div className="focus-action-copy">
        <span>{label}</span>
        <strong>{action.title}</strong>
        {action.projectTitle && <small>{action.projectTitle}</small>}
      </div>
      <div className="focus-action-controls">
        <button className="quiet-button success-button" onClick={() => onComplete(action.ref)} type="button">{action.completed ? "Ripristina" : "Completa"}</button>
        <button className="quiet-button" onClick={onRemove} type="button">Rimuovi dal Focus</button>
      </div>
    </article>
  );
}

export default function DailyFocus({ actions, agentSlot, onChange, onToggleAction, plan }) {
  const focus = resolveDailyFocus(plan, actions);
  const selectedRefs = new Set([plan.primaryActionRef, ...(plan.supportActionRefs || [])]);
  const available = actions.filter((action) => !selectedRefs.has(action.ref));
  const completedCount = [focus.primary, ...focus.support].filter((action) => action?.completed).length;
  const selectedCount = [focus.primary, ...focus.support].filter(Boolean).length;

  function patch(nextPatch) {
    onChange({ ...plan, ...nextPatch });
  }

  function setSupport(index, ref) {
    const refs = [...(plan.supportActionRefs || [])];
    if (ref) refs[index] = ref;
    else refs.splice(index, 1);
    patch({ supportActionRefs: refs.filter(Boolean).slice(0, 2) });
  }

  function moveSupport(index, direction) {
    const refs = [...(plan.supportActionRefs || [])];
    const destination = index + direction;
    if (destination < 0 || destination >= refs.length) return;
    [refs[index], refs[destination]] = [refs[destination], refs[index]];
    patch({ supportActionRefs: refs });
  }

  return (
    <section className="panel focus-panel" aria-labelledby="focus-title">
      <div className="section-heading">
        <div><p className="eyebrow">Focus del giorno</p><h2 id="focus-title">Una cosa importante, due appoggi</h2></div>
        <span className="focus-progress" aria-label={`${completedCount} di ${selectedCount} azioni completate`}>{completedCount}/{selectedCount || 0}</span>
      </div>

      <div className="focus-stack">
        <FocusRow action={focus.primary} label="Principale" onComplete={onToggleAction} onRemove={() => patch({ primaryActionRef: "" })} onSwap={(ref) => patch({ primaryActionRef: ref })} options={available} />
        {[0, 1].map((index) => {
          const action = focus.support[index];
          return (
            <div className="support-row" key={index}>
              <FocusRow action={action} label={`Supporto ${index + 1}`} onComplete={onToggleAction} onRemove={() => setSupport(index, "")} onSwap={(ref) => setSupport(index, ref)} options={available} support />
              {action && <div className="reorder-controls"><button disabled={index === 0} onClick={() => moveSupport(index, -1)} type="button">Prima</button><button disabled={index === 1 || !focus.support[index + 1]} onClick={() => moveSupport(index, 1)} type="button">Dopo</button></div>}
            </div>
          );
        })}
      </div>

      <div className="if-then-row">
        <label>Se…<input onChange={(event) => patch({ ifThen: { ...plan.ifThen, if: event.target.value } })} placeholder="compare un ostacolo concreto" value={plan.ifThen?.if || ""} /></label>
        <label>allora…<input onChange={(event) => patch({ ifThen: { ...plan.ifThen, then: event.target.value } })} placeholder="farò questa risposta minima" value={plan.ifThen?.then || ""} /></label>
      </div>
      {agentSlot}
    </section>
  );
}
