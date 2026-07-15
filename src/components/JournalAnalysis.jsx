const CONFIDENCE_LABELS = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
};

const STEP_TYPE_LABELS = {
  next_step: "Prossimo passo",
  experiment: "Esperimento",
  habit: "Abitudine",
};

function hasItems(items) {
  return Array.isArray(items) && items.length > 0;
}

function AnalysisSection({ children, title }) {
  return (
    <section className="analysis-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function JournalAnalysis({ analysis, onAddSuggestedStep }) {
  if (!analysis) {
    return null;
  }

  return (
    <div className="journal-analysis" aria-label="Analisi Kaizen Analyst">
      {analysis.summary && (
        <AnalysisSection title="Sintesi">
          <p>{analysis.summary}</p>
        </AnalysisSection>
      )}

      {hasItems(analysis.progress) && (
        <AnalysisSection title="Progressi">
          <ul className="analysis-list">
            {analysis.progress.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                {item.title && <strong>{item.title}</strong>}
                {item.evidence && <p>{item.evidence}</p>}
              </li>
            ))}
          </ul>
        </AnalysisSection>
      )}

      {hasItems(analysis.obstacles) && (
        <AnalysisSection title="Ostacoli">
          <ul className="analysis-list">
            {analysis.obstacles.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <div className="analysis-item-heading">
                  {item.title && <strong>{item.title}</strong>}
                  {item.recurring && <span>Ricorrente?</span>}
                </div>
                {item.description && <p>{item.description}</p>}
              </li>
            ))}
          </ul>
        </AnalysisSection>
      )}

      {hasItems(analysis.hypotheses) && (
        <AnalysisSection title="Ipotesi da verificare">
          <ul className="analysis-list">
            {analysis.hypotheses.map((item, index) => (
              <li key={`${item.description}-${index}`}>
                <p>{item.description}</p>
                <small>Confidenza: {CONFIDENCE_LABELS[item.confidence]}</small>
              </li>
            ))}
          </ul>
        </AnalysisSection>
      )}

      {hasItems(analysis.suggestedSteps) && (
        <AnalysisSection title="Prossimi passi">
          <ul className="analysis-list">
            {analysis.suggestedSteps.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <div className="analysis-item-heading">
                  {item.title && <strong>{item.title}</strong>}
                  <span>{STEP_TYPE_LABELS[item.type]}</span>
                </div>
                {item.description && <p>{item.description}</p>}
                {item.sourceActivity && (
                  <small>Da: {item.sourceActivity}</small>
                )}
                {onAddSuggestedStep && (
                  <button
                    className="secondary-button analysis-action"
                    onClick={() => onAddSuggestedStep(item)}
                    type="button"
                  >
                    Aggiungi alle task
                  </button>
                )}
              </li>
            ))}
          </ul>
        </AnalysisSection>
      )}

      {hasItems(analysis.patterns) && (
        <AnalysisSection title="Pattern sotto osservazione">
          <ul className="analysis-list">
            {analysis.patterns.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                {item.name && <strong>{item.name}</strong>}
                {item.evidence && <p>{item.evidence}</p>}
              </li>
            ))}
          </ul>
        </AnalysisSection>
      )}
    </div>
  );
}
