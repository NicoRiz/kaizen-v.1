export default function StreakHeader({ bestStreak, currentStreak }) {
  return (
    <section className="streak-grid" aria-label="Riepilogo streak">
      <article className="metric-card metric-card--primary">
        <span>Streak attuale</span>
        <strong>{currentStreak}</strong>
        <small>giorni produttivi</small>
      </article>
      <article className="metric-card">
        <span>Migliore streak</span>
        <strong>{bestStreak}</strong>
        <small>record personale</small>
      </article>
    </section>
  );
}
