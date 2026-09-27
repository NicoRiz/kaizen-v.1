import { formatNumber, projectPercentage } from "../lib/habits.js";

export function AreaBadge({ area, subtle = false }) {
  if (!area) {
    return null;
  }

  return (
    <span
      className={`area-badge ${subtle ? "area-badge--subtle" : ""}`}
      style={{ "--area-color": area.color }}
    >
      <span aria-hidden="true" />
      {area.name}
    </span>
  );
}

export function ProgressBar({ value, color = "#741b34", label }) {
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      aria-label={label || `${Math.round(percentage)}%`}
      aria-valuemax="100"
      aria-valuemin="0"
      aria-valuenow={Math.round(percentage)}
      className="progress-track"
      role="progressbar"
    >
      <span style={{ "--progress-color": color, width: `${percentage}%` }} />
    </div>
  );
}

export function ProjectProgress({ area, project, compact = false }) {
  const percentage = projectPercentage(project);
  if (percentage === null) {
    return null;
  }

  return (
    <div className={`project-progress ${compact ? "project-progress--compact" : ""}`}>
      <div className="progress-copy">
        <span>
          {formatNumber(project.currentValue)} / {formatNumber(project.targetValue)}{" "}
          {project.progressUnit || ""}
        </span>
        <strong>{Math.round(percentage)}%</strong>
      </div>
      <ProgressBar
        color={area?.color}
        label={`Avanzamento ${project.title}: ${Math.round(percentage)}%`}
        value={percentage}
      />
    </div>
  );
}
