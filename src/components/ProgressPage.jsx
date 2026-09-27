import { useMemo, useState } from "react";
import {
  buildRhythmSeries,
  calculateRhythmSummary,
  formatNumber,
  periodRange,
} from "../lib/habits.js";
import { dateKey } from "../utils/date.js";
import BottomNav from "./BottomNav.jsx";
import { AreaBadge, ProjectProgress } from "./ProgressUi.jsx";

const PERIODS = [
  { key: "7d", label: "7 giorni" },
  { key: "30d", label: "30 giorni" },
  { key: "3m", label: "3 mesi" },
  { key: "1y", label: "1 anno" },
];

function pointSegments(values, width, height, padding) {
  if (values.length === 0) return [];
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const segments = [];
  let current = [];

  values.forEach((value, index) => {
    if (value === null || value === undefined) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      return;
    }
      const x = padding + (values.length === 1 ? usableWidth / 2 : (index / (values.length - 1)) * usableWidth);
      const y = padding + (1 - Math.max(0, Math.min(100, value)) / 100) * usableHeight;
      current.push(`${x},${y}`);
  });
  if (current.length) segments.push(current.join(" "));
  return segments;
}

function RhythmChart({ areas, series, visibleAreaIds }) {
  const width = 720;
  const height = 270;
  const padding = 34;
  const generalValues = series.points.map((point) => point.general);

  return (
    <div className="rhythm-chart-wrap">
      <svg aria-label="Grafico del Ritmo" className="rhythm-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0, 25, 50, 75, 100].map((value) => {
          const y = padding + (1 - value / 100) * (height - padding * 2);
          return <g key={value}><line className="chart-grid-line" x1={padding} x2={width - padding} y1={y} y2={y} /><text x="4" y={y + 4}>{value}%</text></g>;
        })}
        {areas.filter((area) => visibleAreaIds.includes(area.id)).map((area) => {
          const values = series.points.map((point) => point.areaScores.find((score) => score.area.id === area.id)?.value);
          return pointSegments(values, width, height, padding).map((points, index) => <polyline className="chart-line chart-line--area" fill="none" key={`${area.id}-${index}`} points={points} stroke={area.color} />);
        })}
        {pointSegments(generalValues, width, height, padding).map((points, index) => <polyline className="chart-line chart-line--general" fill="none" key={`general-${index}`} points={points} stroke="#2c2122" />)}
      </svg>
      <div className="chart-axis-labels"><span>{series.start}</span><span>{series.end}</span></div>
    </div>
  );
}

function RhythmView({ areas, habits, logs, today }) {
  const [period, setPeriod] = useState("30d");
  const [visibleAreaIds, setVisibleAreaIds] = useState(() => areas.map((area) => area.id));
  const series = useMemo(() => buildRhythmSeries(areas, habits, logs, period, today), [areas, habits, logs, period, today]);
  const range = periodRange(period, today);
  const wholePeriod = useMemo(
    () => calculateRhythmSummary(areas, habits, logs, range.start, range.end),
    [areas, habits, logs, range.end, range.start],
  );

  return (
    <div className="progress-view">
      <div className="period-picker" aria-label="Periodo" role="group">
        {PERIODS.map((item) => <button className={period === item.key ? "is-selected" : ""} key={item.key} onClick={() => setPeriod(item.key)} type="button">{item.label}</button>)}
      </div>

      <div className="rhythm-summary-grid">
        <div className="rhythm-score-card"><span>Ritmo generale</span><strong>{wholePeriod.general === null ? "—" : `${Math.round(wholePeriod.general)}%`}</strong><small>{range.start} → {range.end}</small></div>
        {wholePeriod.areaScores.map(({ area, value }) => <div className="rhythm-score-card" key={area.id} style={{ "--area-color": area.color }}><AreaBadge area={area} /><strong>{Math.round(value)}%</strong></div>)}
      </div>

      {wholePeriod.areaScores.length ? <RhythmChart areas={areas} series={series} visibleAreaIds={visibleAreaIds} /> : <p className="empty-state">Nessun impegno pianificato nel periodo. Le Areas senza impegni non vengono conteggiate come 0%.</p>}

      <div className="chart-legend">
        <span className="legend-general"><i />Generale</span>
        {areas.map((area) => <label key={area.id}><input checked={visibleAreaIds.includes(area.id)} onChange={(event) => setVisibleAreaIds((ids) => event.target.checked ? [...new Set([...ids, area.id])] : ids.filter((id) => id !== area.id))} type="checkbox" /><i style={{ "--legend-color": area.color }} />{area.name}</label>)}
      </div>
    </div>
  );
}

function AdvancementView({ areas, projects }) {
  const [areaFilter, setAreaFilter] = useState("all");
  const quantitativeProjects = projects.filter((project) => project.progressTracking === "quantitative" && project.status !== "someday" && (areaFilter === "all" || project.areaId === areaFilter));
  const grouped = areas.map((area) => ({ area, projects: quantitativeProjects.filter((project) => project.areaId === area.id) })).filter((group) => group.projects.length > 0);
  const unassigned = quantitativeProjects.filter((project) => !areas.some((area) => area.id === project.areaId));

  return (
    <div className="progress-view">
      <label className="progress-filter">Filtra per Area<select onChange={(event) => setAreaFilter(event.target.value)} value={areaFilter}><option value="all">Tutte</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
      {quantitativeProjects.length === 0 ? <p className="empty-state">Nessun Project con avanzamento quantitativo.</p> : (
        <div className="advancement-groups">
          {grouped.map(({ area, projects: areaProjects }) => <section key={area.id}><AreaBadge area={area} /><div className="advancement-grid">{areaProjects.map((project) => <article className="advancement-card" key={project.id}><h3>{project.title}</h3><ProjectProgress area={area} project={project} /><small>{formatNumber(project.currentValue)} {project.progressUnit || "unità"} completate</small></article>)}</div></section>)}
          {unassigned.length > 0 && <section><h3>Senza Area</h3><div className="advancement-grid">{unassigned.map((project) => <article className="advancement-card" key={project.id}><h3>{project.title}</h3><ProjectProgress project={project} /></article>)}</div></section>}
        </div>
      )}
    </div>
  );
}

export default function ProgressPage({ activeSection, areas, habits, logs, onNavigate, projects, today = dateKey() }) {
  const [view, setView] = useState("rhythm");
  return (
    <div className="app-shell">
      <main className="home">
        <header className="topbar section-topbar"><div><p className="eyebrow">Andamento nel tempo</p><h1>Progressi</h1></div></header>
        <section className="panel">
          <div className="tab-list progress-tabs" role="tablist"><button className={view === "rhythm" ? "is-selected" : ""} onClick={() => setView("rhythm")} role="tab" type="button">Ritmo</button><button className={view === "advancement" ? "is-selected" : ""} onClick={() => setView("advancement")} role="tab" type="button">Avanzamento</button></div>
          {view === "rhythm" ? <RhythmView areas={areas} habits={habits} logs={logs} today={today} /> : <AdvancementView areas={areas} projects={projects} />}
        </section>
      </main>
      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />
    </div>
  );
}
